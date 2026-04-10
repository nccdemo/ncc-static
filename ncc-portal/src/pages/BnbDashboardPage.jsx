import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'

import { authFetch } from '../api/authFetch.js'

/**
 * B&B dashboard: live data from GET /api/bnb/partner/summary (same shape as legacy dashboard aggregate).
 * Shows referral link, QR, total_bookings, total_earnings (€).
 */
const TOURS_PUBLIC_ORIGIN =
  import.meta.env.VITE_TOURS_PUBLIC_BASE_URL?.replace(/\/$/, '') || 'http://localhost:5173'

const sectionStyle = {
  background: '#fff',
  borderRadius: 12,
  padding: '18px 16px',
  marginBottom: 16,
  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08)',
  border: '1px solid #e2e8f0',
}

const headingStyle = {
  margin: '0 0 10px',
  fontSize: '0.75rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: '#64748b',
}

const linkBoxStyle = {
  wordBreak: 'break-all',
  fontSize: '0.9rem',
  color: '#0f172a',
  lineHeight: 1.45,
}

const statValueStyle = {
  fontSize: '1.75rem',
  fontWeight: 700,
  color: '#0f172a',
  margin: '4px 0 0',
}

const statLabelStyle = {
  fontSize: '0.85rem',
  color: '#64748b',
  margin: 0,
}

const statsGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
  gap: 16,
}

const errorStyle = {
  color: '#b91c1c',
  fontSize: '0.9rem',
  margin: '0 0 12px',
}

const retryButtonStyle = {
  marginBottom: 16,
  padding: '10px 16px',
  borderRadius: 8,
  border: '1px solid #cbd5e1',
  background: '#fff',
  color: '#0f172a',
  fontSize: '0.9rem',
  fontWeight: 600,
  cursor: 'pointer',
  minHeight: 44,
  WebkitTapHighlightColor: 'transparent',
}

const copyButtonStyle = {
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
  WebkitTapHighlightColor: 'transparent',
}

const downloadQrButtonStyle = {
  marginTop: 16,
  width: '100%',
  minHeight: 48,
  padding: '14px 18px',
  borderRadius: 8,
  border: '2px solid #0f172a',
  background: '#fff',
  color: '#0f172a',
  fontSize: '1rem',
  fontWeight: 700,
  cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent',
}

const qrScanCaptionStyle = {
  margin: '0 0 14px',
  fontSize: '0.95rem',
  fontWeight: 600,
  color: '#334155',
  textAlign: 'center',
}

export default function BnbDashboardPage() {
  const [data, setData] = useState(null)
  const [referralCode, setReferralCode] = useState('')
  const [totalBookings, setTotalBookings] = useState(0)
  const [totalEarningsEur, setTotalEarningsEur] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const copiedResetRef = useRef(0)

  const load = useCallback(async () => {
    setError('')
    setLoading(true)
    try {
      const url = import.meta.env.DEV
        ? 'http://localhost:8000/api/bnb/partner/summary'
        : '/api/bnb/partner/summary'
      const res = await authFetch(url, {
        headers: { Accept: 'application/json' },
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        const d = payload?.detail
        setError(typeof d === 'string' ? d : 'Could not load dashboard.')
        return
      }
      setData(payload)
      console.log('REF CODE:', payload?.referral_code)
      if (import.meta.env.DEV) {
        console.log('BNB DATA:', payload)
      }
      const rc = (payload?.referral_code ?? '').trim()
      setReferralCode(rc)
      if (rc) {
        try {
          localStorage.setItem('bnb', JSON.stringify({ referral_code: rc }))
        } catch {
          /* ignore quota */
        }
      }
      setTotalBookings(Number(payload?.total_bookings ?? 0))
      setTotalEarningsEur(Number(payload?.total_earnings ?? 0))
    } catch {
      setError('Could not load dashboard.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    return () => window.clearTimeout(copiedResetRef.current)
  }, [])

  const qrLink = useMemo(() => {
    const code = referralCode.trim()
    return `${TOURS_PUBLIC_ORIGIN}/tours?ref=${code}`
  }, [referralCode])

  const downloadQR = useCallback(() => {
    const canvas = document.getElementById('qr-code')
    if (!canvas) return
    const pngUrl = canvas
      .toDataURL('image/png')
      .replace('image/png', 'image/octet-stream')
    const downloadLink = document.createElement('a')
    downloadLink.href = pngUrl
    downloadLink.download = 'bnb-qr.png'
    document.body.appendChild(downloadLink)
    downloadLink.click()
    document.body.removeChild(downloadLink)
  }, [])

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(qrLink)
    setCopied(true)
    window.clearTimeout(copiedResetRef.current)
    copiedResetRef.current = window.setTimeout(() => setCopied(false), 2000)
  }, [qrLink])

  const referralUrl = useMemo(() => {
    const code = (referralCode || '').trim()
    const base = `${TOURS_PUBLIC_ORIGIN}/tours`
    if (!code) return base
    return `${base}?ref=${code}`
  }, [referralCode])

  const publicQrPageUrl = useMemo(() => {
    const code = (referralCode || '').trim()
    if (!code) return ''
    return `${TOURS_PUBLIC_ORIGIN}/bnb/qr/${encodeURIComponent(code)}`
  }, [referralCode])

  const referralLink = useMemo(() => {
    const code = (referralCode || '').trim()
    if (!code) return ''
    return `http://${code.toLowerCase()}.localhost:5173`
  }, [referralCode])

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
      <h1 style={{ margin: '0 0 6px', fontSize: '1.5rem', color: '#0f172a' }}>
        B&amp;B Dashboard
      </h1>
      <p style={{ margin: '0 0 20px', color: '#64748b', fontSize: '0.9rem' }}>
        Share your referral link or QR so guests book tours with your code.
      </p>

      {error ? (
        <div style={{ marginBottom: 16 }}>
          <p style={errorStyle}>{error}</p>
          <button type="button" style={retryButtonStyle} onClick={load}>
            Retry
          </button>
        </div>
      ) : null}
      {loading ? (
        <p style={{ color: '#64748b', margin: 0 }}>Loading…</p>
      ) : (
        <>
          <section style={sectionStyle} aria-labelledby="referral-heading">
            <h2 id="referral-heading" style={headingStyle}>
              Referral
            </h2>
            {!referralCode.trim() ? (
              <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>
                No referral code on your profile yet. Ask an administrator to set{' '}
                <strong>referral_code</strong> on your B&amp;B provider record.
              </p>
            ) : (
              <>
                <a href={referralUrl} style={{ ...linkBoxStyle, display: 'block' }}>
                  {referralUrl}
                </a>
                <button type="button" style={copyButtonStyle} onClick={handleCopy}>
                  {copied ? 'Copied!' : 'Copy Link'}
                </button>
              </>
            )}
          </section>

          {referralCode.trim() ? (
            <section style={sectionStyle} aria-labelledby="bnb-client-link-heading">
              <h2 id="bnb-client-link-heading" style={headingStyle}>
                Link e QR (client)
              </h2>
              <div>
                <h3 style={{ margin: '0 0 8px', fontSize: '1.05rem', color: '#0f172a' }}>Il tuo link</h3>
                <input
                  value={referralLink}
                  readOnly
                  aria-label="Il tuo link"
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    fontSize: '0.9rem',
                    marginBottom: 12,
                  }}
                />
                <button
                  type="button"
                  style={copyButtonStyle}
                  onClick={() => navigator.clipboard.writeText(referralLink)}
                >
                  Copia link
                </button>
                <h3 style={{ margin: '20px 0 12px', fontSize: '1.05rem', color: '#0f172a' }}>QR Code</h3>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <QRCodeCanvas value={referralLink} size={200} />
                </div>
              </div>
            </section>
          ) : null}

          <section style={sectionStyle} aria-labelledby="qr-heading">
            <h2 id="qr-heading" style={headingStyle}>
              QR
            </h2>
            {!referralCode.trim() ? (
              <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>
                QR will appear once a referral code is configured.
              </p>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: '8px 0 0',
                  background: '#fff',
                }}
              >
                <p style={qrScanCaptionStyle}>Scan to book your tour</p>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <QRCodeCanvas
                    id="qr-code"
                    value={qrLink}
                    size={200}
                    level="M"
                    includeMargin
                    aria-label="QR code for referral link"
                  />
                </div>
                <button type="button" style={downloadQrButtonStyle} onClick={downloadQR}>
                  Download QR
                </button>
                {publicQrPageUrl ? (
                  <a
                    href={publicQrPageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      ...downloadQrButtonStyle,
                      marginTop: 12,
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxSizing: 'border-box',
                    }}
                  >
                    Scarica QR
                  </a>
                ) : null}
              </div>
            )}
          </section>

          <section style={sectionStyle} aria-labelledby="stats-heading">
            <h2 id="stats-heading" style={headingStyle}>
              Stats
            </h2>
            <div style={statsGridStyle}>
              <div>
                <p style={statLabelStyle}>Total bookings</p>
                <p style={statValueStyle}>{totalBookings}</p>
              </div>
              <div>
                <p style={statLabelStyle}>Total earnings</p>
                <p style={statValueStyle}>
                  €
                  {totalEarningsEur.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
                <p style={{ margin: '6px 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>
                  10% of referred booking totals
                </p>
              </div>
            </div>
          </section>
        </>
      )}
    </main>
  )
}
