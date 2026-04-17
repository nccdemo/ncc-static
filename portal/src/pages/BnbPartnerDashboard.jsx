import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { apiUrl } from '../api/apiUrl.js'
import { authFetch } from '../api/authFetch.js'

const mainStyle = {
  padding: '24px 16px 48px',
  maxWidth: 720,
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

const labelStyle = {
  margin: '0 0 6px',
  fontSize: '0.75rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: '#64748b',
}

const TOURS_BASE =
  (import.meta.env.VITE_TOURS_PUBLIC_BASE_URL || 'http://localhost:5173').replace(/\/$/, '')
/** Public client app (tour booking + ``/bnb/:slug``). Falls back to tour base. */
const CLIENT_PUBLIC_BASE =
  (import.meta.env.VITE_CLIENT_PUBLIC_BASE_URL || TOURS_BASE).replace(/\/$/, '')

/**
 * ``GET /api/bnb/partner/summary`` — panoramica referral (prenotazioni confermate collegate al codice).
 */
export default function BnbPartnerDashboard() {
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [copiedPersonal, setCopiedPersonal] = useState(false)
  const copyTimer = useRef(0)
  const copyTimerPersonal = useRef(0)

  const load = useCallback(async () => {
    setError('')
    setLoading(true)
    try {
      const res = await authFetch(apiUrl('/api/bnb/partner/summary'), {
        headers: { Accept: 'application/json' },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const d = data?.detail
        setError(typeof d === 'string' ? d : 'Impossibile caricare la dashboard.')
        setSummary(null)
        return
      }
      setSummary(data)
      const rc = (data?.referral_code ?? '').trim()
      if (rc) {
        try {
          localStorage.setItem('bnb', JSON.stringify({ referral_code: rc }))
        } catch {
          /* ignore */
        }
      }
    } catch {
      setError('Impossibile caricare la dashboard.')
      setSummary(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    return () => {
      window.clearTimeout(copyTimer.current)
      window.clearTimeout(copyTimerPersonal.current)
    }
  }, [])

  const referralUrl = useMemo(() => {
    const code = (summary?.referral_code ?? '').trim()
    if (!code) return ''
    return `${TOURS_BASE}/tours?ref=${encodeURIComponent(code)}`
  }, [summary])

  const personalizedLandingUrl = useMemo(() => {
    const s = (summary?.public_slug ?? '').trim().toLowerCase()
    if (!s) return ''
    return `${CLIENT_PUBLIC_BASE}/bnb/${encodeURIComponent(s)}`
  }, [summary])

  const copyLink = useCallback(() => {
    if (!referralUrl) return
    void navigator.clipboard.writeText(referralUrl)
    setCopied(true)
    window.clearTimeout(copyTimer.current)
    copyTimer.current = window.setTimeout(() => setCopied(false), 2000)
  }, [referralUrl])

  const copyPersonalLink = useCallback(() => {
    if (!personalizedLandingUrl) return
    void navigator.clipboard.writeText(personalizedLandingUrl)
    setCopiedPersonal(true)
    window.clearTimeout(copyTimerPersonal.current)
    copyTimerPersonal.current = window.setTimeout(() => setCopiedPersonal(false), 2000)
  }, [personalizedLandingUrl])

  const bookings = Number(summary?.total_bookings ?? 0)
  const totalEur = Number(summary?.total_earnings ?? 0)
  const code = (summary?.referral_code ?? '').trim()

  return (
    <main style={mainStyle}>
      <h1 style={{ margin: '0 0 8px', fontSize: '1.35rem', color: '#0f172a' }}>Dashboard</h1>
      <p style={{ margin: '0 0 20px', color: '#64748b', fontSize: '0.9rem' }}>
        Dati da <code style={{ fontSize: '0.8rem' }}>/api/bnb/partner/summary</code> — prenotazioni
        confermate associate al tuo referral.
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
          <div style={{ ...cardStyle, display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            <div>
              <p style={labelStyle}>Totale guadagni (volume prenotazioni)</p>
              <p style={{ margin: 0, fontSize: '1.65rem', fontWeight: 700, color: '#0f172a' }}>
                €{totalEur.toFixed(2)}
              </p>
              <p style={{ margin: '8px 0 0', fontSize: '0.78rem', color: '#94a3b8' }}>
                Somma dei prezzi delle prenotazioni confermate collegate al codice.
              </p>
            </div>
            <div>
              <p style={labelStyle}>Prenotazioni</p>
              <p style={{ margin: 0, fontSize: '1.65rem', fontWeight: 700, color: '#0f172a' }}>{bookings}</p>
              <p style={{ margin: '8px 0 0', fontSize: '0.78rem', color: '#94a3b8' }}>Confermate con il tuo referral.</p>
            </div>
          </div>

          <div style={cardStyle}>
            <p style={labelStyle}>Link referral</p>
            {code ? (
              <>
                <p style={{ margin: '0 0 8px', fontSize: '0.85rem', color: '#64748b' }}>
                  Codice: <strong style={{ color: '#0f172a' }}>{code}</strong>
                </p>
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 8,
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    fontSize: '0.85rem',
                    wordBreak: 'break-all',
                    color: '#334155',
                  }}
                >
                  {referralUrl || '—'}
                </div>
                <button
                  type="button"
                  onClick={copyLink}
                  disabled={!referralUrl}
                  style={{
                    marginTop: 12,
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: 8,
                    border: 'none',
                    background: '#0f172a',
                    color: '#fff',
                    fontWeight: 600,
                    cursor: referralUrl ? 'pointer' : 'not-allowed',
                    opacity: referralUrl ? 1 : 0.5,
                  }}
                >
                  {copied ? 'Copiato!' : 'Copia link'}
                </button>
                <p style={{ margin: '16px 0 0', fontSize: '0.85rem', color: '#64748b' }}>
                  <Link to="/bnb/referrals" style={{ color: '#0f172a', fontWeight: 600 }}>
                    QR e link rapidi → Referrals
                  </Link>
                  {' · '}
                  <Link to="/bnb/earnings" style={{ color: '#0f172a', fontWeight: 600 }}>
                    Split pagamenti → Earnings
                  </Link>
                </p>
              </>
            ) : (
              <p style={{ margin: 0, color: '#64748b' }}>Nessun codice referral sul profilo.</p>
            )}
          </div>

          <div style={cardStyle}>
            <p style={labelStyle}>Landing personalizzata</p>
            <p style={{ margin: '0 0 8px', fontSize: '0.85rem', color: '#64748b', lineHeight: 1.45 }}>
              Imposta lo slug in{' '}
              <Link to="/bnb/profile" style={{ color: '#0f172a', fontWeight: 600 }}>
                Profilo
              </Link>
              . Gli ospiti aprono il tour con branding e referral già attivi.
            </p>
            {personalizedLandingUrl ? (
              <>
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 8,
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    fontSize: '0.85rem',
                    wordBreak: 'break-all',
                    color: '#334155',
                  }}
                >
                  {personalizedLandingUrl}
                </div>
                <button
                  type="button"
                  onClick={copyPersonalLink}
                  style={{
                    marginTop: 12,
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: 8,
                    border: '1px solid #0f172a',
                    background: '#fff',
                    color: '#0f172a',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {copiedPersonal ? 'Copiato!' : 'Copia link landing'}
                </button>
              </>
            ) : (
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                Nessuno slug pubblico: aggiungi un URL breve (es. <code>sanculino</code>) nel profilo.
              </p>
            )}
          </div>

          <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
            <Link to="/bnb/profile" style={{ color: '#0f172a', fontWeight: 600 }}>
              Profilo e branding
            </Link>
          </p>
        </>
      )}
    </main>
  )
}
