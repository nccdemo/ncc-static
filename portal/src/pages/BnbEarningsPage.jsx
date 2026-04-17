import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { apiUrl } from '../api/apiUrl.js'
import { authFetch } from '../api/authFetch.js'

const mainStyle = {
  padding: '24px 16px 48px',
  maxWidth: 800,
  margin: '0 auto',
  width: '100%',
  boxSizing: 'border-box',
}

const cardStyle = {
  background: '#fff',
  borderRadius: 12,
  padding: '20px 18px',
  marginBottom: 16,
  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08)',
  border: '1px solid #e2e8f0',
}

const th = {
  textAlign: 'left',
  fontSize: '0.72rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: '#64748b',
  padding: '10px 12px',
  borderBottom: '1px solid #e2e8f0',
}

const td = {
  padding: '12px',
  fontSize: '0.9rem',
  color: '#0f172a',
  borderBottom: '1px solid #f1f5f9',
}

function eur(n) {
  const x = Number(n)
  if (!Number.isFinite(x)) return '—'
  return `€${x.toFixed(2)}`
}

/**
 * ``GET /api/bnb/partner/earnings`` — totali da pagamenti (card/cash) con split B&amp;B / piattaforma / autista.
 */
export default function BnbEarningsPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await authFetch(apiUrl('/api/bnb/partner/earnings'), {
        headers: { Accept: 'application/json' },
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        const d = body?.detail
        throw new Error(typeof d === 'string' ? d : 'Impossibile caricare i guadagni.')
      }
      setData(body)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore di caricamento')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const paymentCount = Number(data?.payment_count ?? 0)
  const totalBookings = Number(data?.total_bookings ?? 0)
  const gross = Number(data?.total_gross ?? 0)
  const bnb = Number(data?.total_bnb_earnings ?? 0)
  const platform = Number(data?.total_platform ?? 0)
  const driver = Number(data?.total_driver ?? 0)

  return (
    <main style={mainStyle}>
      <h1 style={{ margin: '0 0 8px', fontSize: '1.35rem', color: '#0f172a' }}>Earnings</h1>
      <p style={{ margin: '0 0 20px', color: '#64748b', fontSize: '0.9rem' }}>
        Storico aggregato da <code style={{ fontSize: '0.8rem' }}>/api/bnb/partner/earnings</code> — tutti i
        pagamenti registrati (stati pagati) collegati al tuo B&amp;B.
      </p>

      {error ? (
        <p style={{ color: '#b91c1c', fontSize: '0.9rem' }} role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p style={{ color: '#64748b' }}>Caricamento…</p>
      ) : (
        <>
          <div style={cardStyle}>
            <h2 style={{ margin: '0 0 12px', fontSize: '1rem', color: '#0f172a' }}>Riepilogo pagamenti</h2>
            <p style={{ margin: '0 0 16px', fontSize: '0.85rem', color: '#64748b' }}>
              Non è disponibile l&apos;elenco riga-per-riga da questa API: qui vedi il consolidato di tutti i
              pagamenti elaborati.
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Ambito</th>
                    <th style={{ ...th, textAlign: 'right' }}>Valore</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={td}>Pagamenti registrati</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{paymentCount}</td>
                  </tr>
                  <tr>
                    <td style={td}>Prenotazioni confermate (collegate)</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{totalBookings}</td>
                  </tr>
                  <tr>
                    <td style={td}>Totale lordo incassato</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{eur(gross)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div style={cardStyle}>
            <h2 style={{ margin: '0 0 12px', fontSize: '1rem', color: '#0f172a' }}>Split commissioni</h2>
            <p style={{ margin: '0 0 16px', fontSize: '0.85rem', color: '#64748b' }}>
              Riparto cumulativo: B&amp;B, piattaforma, autista (sui pagamenti sopra).
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Voce</th>
                    <th style={{ ...th, textAlign: 'right' }}>Importo</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={td}>B&amp;B (tua quota)</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#0f766e' }}>{eur(bnb)}</td>
                  </tr>
                  <tr>
                    <td style={td}>Piattaforma</td>
                    <td style={{ ...td, textAlign: 'right' }}>{eur(platform)}</td>
                  </tr>
                  <tr>
                    <td style={td}>Autista</td>
                    <td style={{ ...td, textAlign: 'right' }}>{eur(driver)}</td>
                  </tr>
                  <tr>
                    <td style={{ ...td, fontWeight: 600 }}>Totale lordo (controllo)</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{eur(gross)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
            <Link to="/bnb-dashboard" style={{ color: '#0f172a', fontWeight: 600 }}>
              ← Dashboard
            </Link>
          </p>
        </>
      )}
    </main>
  )
}
