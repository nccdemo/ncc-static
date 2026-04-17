import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { apiUrl } from '../api/apiUrl.js'
import { authFetch } from '../api/authFetch.js'

const mainStyle = {
  padding: '24px 16px 48px',
  maxWidth: 900,
  margin: '0 auto',
  width: '100%',
  boxSizing: 'border-box',
}

const gridStyle = {
  display: 'grid',
  gap: 16,
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  marginBottom: 24,
}

const cardStyle = {
  background: '#fff',
  borderRadius: 12,
  padding: '20px 18px',
  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08)',
  border: '1px solid #e2e8f0',
}

const labelStyle = {
  margin: '0 0 8px',
  fontSize: '0.75rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: '#64748b',
}

function formatEur(n) {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(n) || 0)
}

/**
 * Panoramica admin: autisti + B&B, trip attivi, incassi da API esistenti.
 *
 * - ``GET /api/drivers/`` + ``GET /api/admin/bnb`` → account operativi (driver + partner)
 * - ``GET /api/trips/active`` → trip in corso / assegnati
 * - ``GET /api/payments/summary`` → incassi (Stripe + contanti)
 */
export default function AdminDashboardPage() {
  const [driverCount, setDriverCount] = useState(null)
  const [bnbCount, setBnbCount] = useState(null)
  const [activeTrips, setActiveTrips] = useState(null)
  const [paymentSummary, setPaymentSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    setLoading(true)
    try {
      const [dRes, bRes, tRes, pRes] = await Promise.all([
        authFetch(apiUrl('/api/drivers/'), { headers: { Accept: 'application/json' } }),
        authFetch(apiUrl('/api/admin/bnb'), { headers: { Accept: 'application/json' } }),
        authFetch(apiUrl('/api/trips/active'), { headers: { Accept: 'application/json' } }),
        authFetch(apiUrl('/api/payments/summary'), { headers: { Accept: 'application/json' } }),
      ])

      const errs = []

      if (dRes.ok) {
        const d = await dRes.json().catch(() => [])
        setDriverCount(Array.isArray(d) ? d.length : 0)
      } else {
        setDriverCount(null)
        errs.push('autisti')
      }

      if (bRes.ok) {
        const b = await bRes.json().catch(() => [])
        setBnbCount(Array.isArray(b) ? b.length : 0)
      } else {
        setBnbCount(null)
        errs.push('B&B')
      }

      if (tRes.ok) {
        const t = await tRes.json().catch(() => [])
        setActiveTrips(Array.isArray(t) ? t.length : 0)
      } else {
        setActiveTrips(null)
        errs.push('trip')
      }

      if (pRes.ok) {
        const p = await pRes.json().catch(() => null)
        setPaymentSummary(p && typeof p === 'object' ? p : null)
      } else {
        setPaymentSummary(null)
        errs.push('pagamenti')
      }

      if (errs.length) {
        setError(`Alcuni dati non sono stati caricati: ${errs.join(', ')}. Verifica i permessi admin.`)
      }
    } catch {
      setError('Impossibile raggiungere il server.')
      setDriverCount(null)
      setBnbCount(null)
      setActiveTrips(null)
      setPaymentSummary(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const userTotal =
    driverCount != null && bnbCount != null ? driverCount + bnbCount : null

  const grossIncassi =
    paymentSummary != null
      ? (Number(paymentSummary.total_paid) || 0) + (Number(paymentSummary.cash_paid) || 0)
      : null

  return (
    <main style={mainStyle}>
      <h1 style={{ margin: '0 0 8px', fontSize: '1.35rem', color: '#0f172a' }}>Dashboard</h1>
      <p style={{ margin: '0 0 20px', color: '#64748b', fontSize: '0.9rem', lineHeight: 1.5 }}>
        Indicatori da{' '}
        <code style={{ fontSize: '0.8rem' }}>/api/drivers</code>,{' '}
        <code style={{ fontSize: '0.8rem' }}>/api/admin/bnb</code>,{' '}
        <code style={{ fontSize: '0.8rem' }}>/api/trips/active</code>,{' '}
        <code style={{ fontSize: '0.8rem' }}>/api/payments/summary</code>.
      </p>

      {error ? (
        <p style={{ color: '#b45309', fontSize: '0.9rem', marginBottom: 16 }} role="status">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p style={{ color: '#64748b' }}>Caricamento…</p>
      ) : (
        <>
          <div style={gridStyle}>
            <div style={cardStyle}>
              <p style={labelStyle}>Numero utenti</p>
              <p style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700, color: '#0f172a' }}>
                {userTotal != null ? userTotal : '—'}
              </p>
              <p style={{ margin: '10px 0 0', fontSize: '0.78rem', color: '#94a3b8', lineHeight: 1.4 }}>
                Somma account autista ({driverCount ?? '—'}) e partner B&amp;B ({bnbCount ?? '—'}).
              </p>
            </div>
            <div style={cardStyle}>
              <p style={labelStyle}>Trip attivi</p>
              <p style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700, color: '#0f172a' }}>
                {activeTrips != null ? activeTrips : '—'}
              </p>
              <p style={{ margin: '10px 0 0', fontSize: '0.78rem', color: '#94a3b8', lineHeight: 1.4 }}>
                Stati operativi (scheduled … in_progress) da{' '}
                <code style={{ fontSize: '0.7rem' }}>/api/trips/active</code>.
              </p>
            </div>
            <div style={cardStyle}>
              <p style={labelStyle}>Incassi totali</p>
              <p style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700, color: '#0f172a' }}>
                {grossIncassi != null ? formatEur(grossIncassi) : '—'}
              </p>
              <p style={{ margin: '10px 0 0', fontSize: '0.78rem', color: '#94a3b8', lineHeight: 1.4 }}>
                Pagato Stripe + contanti confermati. Netto dopo rimborsi:{' '}
                {paymentSummary != null ? formatEur(paymentSummary.net) : '—'}.
              </p>
            </div>
          </div>

          <p style={{ margin: 0, fontSize: '0.9rem', color: '#64748b' }}>
            <Link to="/admin/users" style={{ color: '#0f172a', fontWeight: 600 }}>
              Utenti
            </Link>
            {' · '}
            <Link to="/admin/trips" style={{ color: '#0f172a', fontWeight: 600 }}>
              Trip
            </Link>
            {' · '}
            <Link to="/admin/payments" style={{ color: '#0f172a', fontWeight: 600 }}>
              Pagamenti
            </Link>
            {' · '}
            <Link to="/admin/tracking" style={{ color: '#0f172a', fontWeight: 600 }}>
              Tracking
            </Link>
          </p>
        </>
      )}
    </main>
  )
}
