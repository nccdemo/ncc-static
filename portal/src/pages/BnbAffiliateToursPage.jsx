import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { QRCodeCanvas } from 'qrcode.react'

import { authFetch } from '../api/authFetch.js'

/**
 * B&B affiliate tools: list tours, per-tour referral link + QR (portal URL → redirect to client app).
 */
function readReferralFromStorage() {
  try {
    const raw = localStorage.getItem('bnb')
    if (!raw) return null
    const o = JSON.parse(raw)
    const code = o?.referral_code
    if (code == null || String(code).trim() === '') return null
    return String(code).trim().toUpperCase()
  } catch {
    return null
  }
}

async function fetchReferralFromPartnerMe() {
  const res = await authFetch('/api/bnb/partner/me', {
    headers: { Accept: 'application/json' },
  })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok) {
    const d = payload?.detail
    throw new Error(typeof d === 'string' ? d : 'Could not load referral code')
  }
  const code = (payload?.referral_code ?? '').trim().toUpperCase()
  if (code) {
    localStorage.setItem('bnb', JSON.stringify({ referral_code: code }))
  }
  return code || null
}

export default function BnbAffiliateToursPage() {
  const [tours, setTours] = useState([])
  const [referralCode, setReferralCode] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copiedId, setCopiedId] = useState(null)
  const copyResetRef = useRef(0)

  const portalOrigin = useMemo(
    () => (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5177'),
    [],
  )

  const load = useCallback(async () => {
    setError('')
    setLoading(true)
    try {
      let ref = readReferralFromStorage()
      if (!ref) {
        ref = await fetchReferralFromPartnerMe()
      }
      if (!ref) {
        setError('Nessun referral_code sul profilo. Contatta l’amministratore.')
        setReferralCode('')
      } else {
        setReferralCode(ref)
      }

      const res = await fetch('/api/tours', {
        headers: { Accept: 'application/json' },
      })
      const data = await res.json().catch(() => [])
      if (!res.ok) {
        const d = data?.detail
        throw new Error(typeof d === 'string' ? d : 'Impossibile caricare i tour')
      }
      setTours(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore di caricamento')
      setTours([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    return () => window.clearTimeout(copyResetRef.current)
  }, [])

  const affiliateLink = useCallback(
    (tourId) => {
      const code = referralCode.trim()
      if (!code) return ''
      return `${portalOrigin}/tours/${tourId}?ref=${encodeURIComponent(code)}`
    },
    [portalOrigin, referralCode],
  )

  const handleCopy = useCallback(
    (tourId) => {
      const link = affiliateLink(tourId)
      if (!link) return
      void navigator.clipboard.writeText(link)
      setCopiedId(tourId)
      window.clearTimeout(copyResetRef.current)
      copyResetRef.current = window.setTimeout(() => setCopiedId(null), 2000)
    },
    [affiliateLink],
  )

  const cardStyle = {
    background: '#fff',
    borderRadius: 12,
    padding: '18px 16px',
    marginBottom: 16,
    border: '1px solid #e2e8f0',
    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06)',
  }

  const btnStyle = {
    marginTop: 12,
    width: '100%',
    minHeight: 44,
    padding: '12px 16px',
    borderRadius: 8,
    border: 'none',
    background: '#0f172a',
    color: '#fff',
    fontSize: '0.9rem',
    fontWeight: 600,
    cursor: 'pointer',
  }

  return (
    <main
      style={{
        padding: '20px 16px 48px',
        maxWidth: 560,
        margin: '0 auto',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <p style={{ margin: '0 0 8px' }}>
        <Link to="/bnb-dashboard" style={{ color: '#0f172a', fontSize: '0.9rem' }}>
          ← Dashboard
        </Link>
      </p>
      <h1 style={{ margin: '0 0 6px', fontSize: '1.5rem', color: '#0f172a' }}>Link affiliato tour</h1>
      <p style={{ margin: '0 0 20px', color: '#64748b', fontSize: '0.9rem' }}>
        Copia il link o il QR per ogni tour. I clienti prenotano senza accedere al portale B&amp;B.
      </p>

      {error ? (
        <p style={{ color: '#b91c1c', fontSize: '0.9rem', marginBottom: 16 }} role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p style={{ color: '#64748b', margin: 0 }}>Caricamento…</p>
      ) : !referralCode.trim() ? null : tours.length === 0 ? (
        <p style={{ color: '#64748b', margin: 0 }}>Nessun tour disponibile.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {tours.map((t) => {
            const id = t.id
            const title = t.title ?? t.name ?? `Tour #${id}`
            const priceRaw = t.price ?? t.base_price
            const price =
              priceRaw != null && !Number.isNaN(Number(priceRaw))
                ? `€${Number(priceRaw).toFixed(2)}`
                : '—'
            const link = affiliateLink(id)
            return (
              <li key={id} style={cardStyle}>
                <h2 style={{ margin: '0 0 8px', fontSize: '1.1rem', color: '#0f172a' }}>{title}</h2>
                <p style={{ margin: '0 0 12px', fontSize: '0.95rem', color: '#475569' }}>
                  Prezzo: <strong>{price}</strong>
                </p>
                <p
                  style={{
                    margin: 0,
                    fontSize: '0.8rem',
                    wordBreak: 'break-all',
                    color: '#64748b',
                    lineHeight: 1.45,
                  }}
                >
                  {link}
                </p>
                <button type="button" style={btnStyle} onClick={() => handleCopy(id)}>
                  {copiedId === id ? 'Copiato!' : 'Copia link'}
                </button>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    marginTop: 16,
                    paddingTop: 16,
                    borderTop: '1px solid #f1f5f9',
                  }}
                >
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: 8 }}>
                    QR
                  </span>
                  {link ? (
                    <QRCodeCanvas value={link} size={160} level="M" includeMargin aria-label={`QR tour ${id}`} />
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
