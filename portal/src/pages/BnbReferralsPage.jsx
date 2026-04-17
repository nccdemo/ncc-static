import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { QRCodeCanvas } from 'qrcode.react'

import { apiUrl } from '../api/apiUrl.js'
import { authFetch } from '../api/authFetch.js'

const mainStyle = {
  padding: '24px 16px 48px',
  maxWidth: 560,
  margin: '0 auto',
  width: '100%',
  boxSizing: 'border-box',
}

const cardStyle = {
  background: '#fff',
  borderRadius: 12,
  padding: '24px 20px',
  marginBottom: 16,
  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08)',
  border: '1px solid #e2e8f0',
  textAlign: 'center',
}

const TOURS_BASE =
  (import.meta.env.VITE_TOURS_PUBLIC_BASE_URL || 'http://localhost:5173').replace(/\/$/, '')
const CLIENT_PUBLIC_BASE =
  (import.meta.env.VITE_CLIENT_PUBLIC_BASE_URL || TOURS_BASE).replace(/\/$/, '')

/**
 * Link + QR dal referral: ``GET /api/bnb/partner/summary`` (``referral_code``, ``public_slug``).
 */
export default function BnbReferralsPage() {
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [copiedLanding, setCopiedLanding] = useState(false)
  const copyTimer = useRef(0)
  const copyTimerLanding = useRef(0)

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
        setError(typeof d === 'string' ? d : 'Impossibile caricare il referral.')
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
      setError('Impossibile caricare il referral.')
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
      window.clearTimeout(copyTimerLanding.current)
    }
  }, [])

  const referralUrl = useMemo(() => {
    const code = (summary?.referral_code ?? '').trim()
    if (!code) return ''
    return `${TOURS_BASE}/tours?ref=${encodeURIComponent(code)}`
  }, [summary])

  const landingPageUrl = useMemo(() => {
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

  const copyLandingLink = useCallback(() => {
    if (!landingPageUrl) return
    void navigator.clipboard.writeText(landingPageUrl)
    setCopiedLanding(true)
    window.clearTimeout(copyTimerLanding.current)
    copyTimerLanding.current = window.setTimeout(() => setCopiedLanding(false), 2000)
  }, [landingPageUrl])

  const downloadQr = useCallback(() => {
    const canvas = document.getElementById('bnb-referral-qr')
    if (!canvas || !(canvas instanceof HTMLCanvasElement)) return
    const url = canvas.toDataURL('image/png').replace('image/png', 'image/octet-stream')
    const a = document.createElement('a')
    a.href = url
    a.download = `bnb-referral-${(summary?.referral_code || 'qr').trim()}.png`
    a.click()
  }, [summary?.referral_code])

  const downloadLandingQr = useCallback(() => {
    const canvas = document.getElementById('bnb-landing-qr')
    if (!canvas || !(canvas instanceof HTMLCanvasElement)) return
    const url = canvas.toDataURL('image/png').replace('image/png', 'image/octet-stream')
    const a = document.createElement('a')
    a.href = url
    const s = (summary?.public_slug || 'landing').trim()
    a.download = `bnb-landing-${s}.png`
    a.click()
  }, [summary?.public_slug])

  const code = (summary?.referral_code ?? '').trim()

  return (
    <main style={mainStyle}>
      <h1 style={{ margin: '0 0 8px', fontSize: '1.35rem', color: '#0f172a' }}>Referrals</h1>
      <p style={{ margin: '0 0 20px', color: '#64748b', fontSize: '0.9rem' }}>
        Link personalizzato e QR per far prenotare i clienti con il tuo codice (catalogo tour pubblico).
      </p>

      {error ? (
        <p style={{ color: '#b91c1c', fontSize: '0.9rem' }} role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p style={{ color: '#64748b' }}>Caricamento…</p>
      ) : !code ? (
        <p style={{ color: '#64748b' }}>Nessun codice referral configurato.</p>
      ) : (
        <>
          <div style={cardStyle}>
            <p style={{ margin: '0 0 6px', fontSize: '0.75rem', fontWeight: 700, color: '#64748b' }}>
              LINK PERSONALIZZATO
            </p>
            <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: '#0f172a' }}>
              Codice: <strong>{code}</strong>
            </p>
            <div
              style={{
                textAlign: 'left',
                padding: '12px 14px',
                borderRadius: 8,
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                fontSize: '0.82rem',
                wordBreak: 'break-all',
                color: '#334155',
                marginBottom: 12,
              }}
            >
              {referralUrl}
            </div>
            <button
              type="button"
              onClick={copyLink}
              style={{
                width: '100%',
                maxWidth: 320,
                margin: '0 auto',
                display: 'block',
                padding: '12px 16px',
                borderRadius: 8,
                border: 'none',
                background: '#0f172a',
                color: '#fff',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {copied ? 'Copiato!' : 'Copia link'}
            </button>
          </div>

          <div style={cardStyle}>
            <p style={{ margin: '0 0 16px', fontSize: '0.75rem', fontWeight: 700, color: '#64748b' }}>
              QR CODE
            </p>
            <div style={{ display: 'inline-block', padding: 16, background: '#fff', borderRadius: 12 }}>
              {referralUrl ? (
                <QRCodeCanvas id="bnb-referral-qr" value={referralUrl} size={220} level="M" />
              ) : null}
            </div>
            <button
              type="button"
              onClick={downloadQr}
              disabled={!referralUrl}
              style={{
                marginTop: 16,
                padding: '10px 18px',
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                background: '#fff',
                color: '#0f172a',
                fontWeight: 600,
                cursor: referralUrl ? 'pointer' : 'not-allowed',
              }}
            >
              Scarica PNG
            </button>
          </div>

          {landingPageUrl ? (
            <>
              <div style={{ ...cardStyle, marginTop: 20 }}>
                <p style={{ margin: '0 0 6px', fontSize: '0.75rem', fontWeight: 700, color: '#64748b' }}>
                  LANDING PERSONALIZZATA
                </p>
                <p style={{ margin: '0 0 12px', fontSize: '0.82rem', color: '#64748b', lineHeight: 1.45 }}>
                  Pagina con branding e referral già impostato (stesso sito tour, percorso <code>/bnb/slug</code>).
                </p>
                <div
                  style={{
                    textAlign: 'left',
                    padding: '12px 14px',
                    borderRadius: 8,
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    fontSize: '0.82rem',
                    wordBreak: 'break-all',
                    color: '#334155',
                    marginBottom: 12,
                  }}
                >
                  {landingPageUrl}
                </div>
                <button
                  type="button"
                  onClick={copyLandingLink}
                  style={{
                    width: '100%',
                    maxWidth: 320,
                    margin: '0 auto',
                    display: 'block',
                    padding: '12px 16px',
                    borderRadius: 8,
                    border: '1px solid #0f172a',
                    background: '#fff',
                    color: '#0f172a',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {copiedLanding ? 'Copiato!' : 'Copia link landing'}
                </button>
              </div>

              <div style={{ ...cardStyle, marginTop: 20 }}>
                <p style={{ margin: '0 0 16px', fontSize: '0.75rem', fontWeight: 700, color: '#64748b' }}>
                  QR LANDING
                </p>
                <div style={{ display: 'inline-block', padding: 16, background: '#fff', borderRadius: 12 }}>
                  <QRCodeCanvas id="bnb-landing-qr" value={landingPageUrl} size={220} level="M" />
                </div>
                <button
                  type="button"
                  onClick={downloadLandingQr}
                  style={{
                    marginTop: 16,
                    padding: '10px 18px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    background: '#fff',
                    color: '#0f172a',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Scarica PNG landing
                </button>
              </div>
            </>
          ) : null}

          <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b', textAlign: 'center' }}>
            <Link to="/bnb-dashboard" style={{ color: '#0f172a', fontWeight: 600 }}>
              Dashboard
            </Link>
            {' · '}
            <Link to="/bnb/earnings" style={{ color: '#0f172a', fontWeight: 600 }}>
              Earnings
            </Link>
          </p>
        </>
      )}
    </main>
  )
}
