import { useCallback, useEffect, useState } from 'react'

import { apiUrl } from '../../api/apiUrl.js'
import { authFetch } from '../../api/authFetch.js'

const mainStyle = {
  padding: '24px 16px 48px',
  maxWidth: 1280,
  margin: '0 auto',
  width: '100%',
  boxSizing: 'border-box',
}

/** Stripe Dashboard: use ``/test/`` when using test API keys. */
const STRIPE_PI_DASHBOARD_BASE = import.meta.env.VITE_STRIPE_DASHBOARD_USE_TEST === '1'
  ? 'https://dashboard.stripe.com/test/payments'
  : 'https://dashboard.stripe.com/payments'

const STRIPE_SESSION_DASHBOARD_BASE = import.meta.env.VITE_STRIPE_DASHBOARD_USE_TEST === '1'
  ? 'https://dashboard.stripe.com/test/checkout/sessions'
  : 'https://dashboard.stripe.com/checkout/sessions'

function detailMessage(detail) {
  if (detail == null) return ''
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail.map((x) => (typeof x === 'object' && x?.msg ? x.msg : String(x))).join('; ')
  }
  if (typeof detail === 'object' && detail.msg) return String(detail.msg)
  return ''
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
 * Admin pagamenti: ``GET /api/payments/admin``, refund ``POST /api/payments/{id}/refund``, link Stripe Dashboard.
 */
export default function AdminPaymentsPage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    setError('')
    setLoading(true)
    try {
      const res = await authFetch(apiUrl('/api/payments/admin'), {
        headers: { Accept: 'application/json' },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(detailMessage(data?.detail) || 'Impossibile caricare i pagamenti.')
      }
      setRows(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e?.message || 'Errore di caricamento.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const refund = useCallback(
    (paymentId, amountLabel) => {
      if (
        !window.confirm(
          `Confermi il rimborso del pagamento #${paymentId} (${amountLabel})? ` +
            'Per pagamenti Stripe verrà creato un refund sul PaymentIntent.',
        )
      ) {
        return
      }
      setBusyId(paymentId)
      setError('')
      void (async () => {
        try {
          const res = await authFetch(apiUrl(`/api/payments/${paymentId}/refund`), {
            method: 'POST',
            headers: { Accept: 'application/json' },
          })
          const data = await res.json().catch(() => ({}))
          if (!res.ok) {
            throw new Error(detailMessage(data?.detail) || 'Rimborso non riuscito.')
          }
          await load()
        } catch (e) {
          setError(e?.message || 'Rimborso non riuscito.')
        } finally {
          setBusyId(null)
        }
      })()
    },
    [load],
  )

  return (
    <main style={mainStyle}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
        <h1 style={{ margin: 0, fontSize: '1.35rem', color: '#0f172a' }}>Pagamenti</h1>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || busyId != null}
          style={{
            padding: '6px 12px',
            borderRadius: 8,
            border: '1px solid #cbd5e1',
            background: '#fff',
            fontSize: '0.85rem',
            fontWeight: 600,
            cursor: loading ? 'wait' : 'pointer',
          }}
        >
          Aggiorna
        </button>
      </div>
      <p style={{ margin: '0 0 12px', color: '#64748b', fontSize: '0.88rem', lineHeight: 1.5 }}>
        Dati da <code style={{ fontSize: '0.78rem' }}>GET /api/payments/admin</code> · Rimborso{' '}
        <code style={{ fontSize: '0.78rem' }}>POST /api/payments/&#123;id&#125;/refund</code> (admin + Stripe se
        applicabile). Link alla{' '}
        <a href="https://dashboard.stripe.com/" target="_blank" rel="noreferrer" style={{ color: '#0f172a' }}>
          Stripe Dashboard
        </a>
        {import.meta.env.VITE_STRIPE_DASHBOARD_USE_TEST === '1'
          ? ' (percorso test attivo via VITE_STRIPE_DASHBOARD_USE_TEST).'
          : ' (imposta VITE_STRIPE_DASHBOARD_USE_TEST=1 se usi chiavi test).'}
      </p>

      {error ? (
        <p style={{ color: '#b91c1c', fontSize: '0.9rem', marginBottom: 12 }} role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p style={{ color: '#64748b' }}>Caricamento…</p>
      ) : rows.length === 0 ? (
        <p style={{ color: '#64748b' }}>Nessun pagamento.</p>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid #e2e8f0' }}>ID</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid #e2e8f0' }}>Prenotazione</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid #e2e8f0' }}>Cliente</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid #e2e8f0' }}>Importo</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid #e2e8f0' }}>Stato</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid #e2e8f0' }}>Driver</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid #e2e8f0' }}>B&amp;B</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid #e2e8f0' }}>Piattaforma</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid #e2e8f0', minWidth: 200 }}>Stripe / azioni</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const id = r.id
                const st = String(r.status || '').toLowerCase()
                const isRefunded = st === 'refunded'
                const canRefund = !isRefunded && st !== 'pending'
                const pi = (r.stripe_payment_intent || '').trim()
                const sess = (r.stripe_session_id || '').trim()
                const piUrl = pi ? `${STRIPE_PI_DASHBOARD_BASE}/${encodeURIComponent(pi)}` : null
                const sessUrl = sess ? `${STRIPE_SESSION_DASHBOARD_BASE}/${encodeURIComponent(sess)}` : null
                const busy = busyId === id
                return (
                  <tr key={id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px', fontFamily: 'ui-monospace, monospace', fontWeight: 600 }}>{id}</td>
                    <td style={{ padding: '8px', color: '#475569' }}>#{r.booking_id}</td>
                    <td style={{ padding: '8px', color: '#334155' }}>
                      <div>{r.customer_name || '—'}</div>
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{r.email || ''}</div>
                    </td>
                    <td style={{ padding: '8px', fontWeight: 600 }}>{formatEur(r.amount)}</td>
                    <td style={{ padding: '8px' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: 6,
                          background: isRefunded ? '#fef2f2' : st === 'paid' ? '#ecfdf5' : '#f8fafc',
                          color: isRefunded ? '#b91c1c' : '#334155',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                        }}
                      >
                        {st || '—'}
                      </span>
                    </td>
                    <td style={{ padding: '8px', color: '#475569' }}>{formatEur(r.amount_driver)}</td>
                    <td style={{ padding: '8px', color: '#475569' }}>{formatEur(r.amount_bnb)}</td>
                    <td style={{ padding: '8px', color: '#475569' }}>{formatEur(r.amount_platform)}</td>
                    <td style={{ padding: '8px', verticalAlign: 'top' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
                        {piUrl ? (
                          <a href={piUrl} target="_blank" rel="noreferrer" style={{ fontSize: '0.75rem', fontWeight: 600, color: '#635bff' }}>
                            PaymentIntent →
                          </a>
                        ) : (
                          <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Nessun PI</span>
                        )}
                        {sessUrl ? (
                          <a href={sessUrl} target="_blank" rel="noreferrer" style={{ fontSize: '0.75rem', fontWeight: 600, color: '#635bff' }}>
                            Checkout session →
                          </a>
                        ) : null}
                        <button
                          type="button"
                          disabled={!canRefund || busy}
                          onClick={() => refund(id, formatEur(r.amount))}
                          style={{
                            padding: '6px 10px',
                            borderRadius: 6,
                            border: '1px solid #b91c1c',
                            background: canRefund ? '#fff' : '#f1f5f9',
                            color: canRefund ? '#b91c1c' : '#94a3b8',
                            fontWeight: 600,
                            fontSize: '0.72rem',
                            cursor: !canRefund || busy ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {busy ? '…' : isRefunded ? 'Rimborsato' : 'Refund'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
