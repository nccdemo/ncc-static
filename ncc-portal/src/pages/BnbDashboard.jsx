import { useCallback, useEffect, useMemo, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'

import { authFetch } from '../api/authFetch.js'
import { uploadCoverUrl, uploadLogoUrl } from '../api/uploadConfig.js'

const API_ORIGIN = (import.meta.env.VITE_API_ORIGIN || 'http://localhost:8000').replace(/\/$/, '')

const pageStyle = {
  padding: '20px 16px 48px',
  maxWidth: 640,
  margin: '0 auto',
  width: '100%',
  boxSizing: 'border-box',
}

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

const tourRowStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: '12px 0',
  borderBottom: '1px solid #e2e8f0',
}

const brandFieldLabelStyle = {
  display: 'block',
  marginTop: 16,
  marginBottom: 6,
  fontWeight: 600,
  fontSize: '0.9rem',
  color: '#334155',
}

const brandTextInputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid #cbd5e1',
  fontSize: '0.95rem',
}

function apiUrl(path) {
  if (path.startsWith('/api/')) {
    return `${API_ORIGIN}${path}`
  }
  return path
}

function resolveMediaUrl(path) {
  if (!path || typeof path !== 'string') return ''
  const p = path.trim()
  if (!p) return ''
  if (p.startsWith('http://') || p.startsWith('https://')) return p
  return API_ORIGIN ? `${API_ORIGIN}${p.startsWith('/') ? p : `/${p}`}` : p
}

function resolveStoredAssetUrl(raw, host) {
  if (!raw || typeof raw !== 'string') return ''
  const t = raw.trim()
  if (!t) return ''
  if (t.startsWith('http://') || t.startsWith('https://')) return t
  const path = t.startsWith('/') ? t : `/${t}`
  return `${host}${path}`
}

/** Prefix for static uploads (default matches local API). */
const BRANDING_ASSET_HOST = (
  import.meta.env.VITE_API_BASE ||
  import.meta.env.VITE_API_ORIGIN ||
  'http://localhost:8000'
).replace(/\/$/, '')

export default function BnbDashboard() {
  const [bnb, setBnb] = useState(null)
  const [earnings, setEarnings] = useState(null)
  const [tours, setTours] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [coverUrl, setCoverUrl] = useState('')
  const [brandSaving, setBrandSaving] = useState(false)
  const [brandError, setBrandError] = useState('')

  const applyMePayload = useCallback((data) => {
    if (!data || typeof data !== 'object') return
    setName(String(data.display_name ?? data.name ?? '').trim())
    setEmail(typeof data.email === 'string' ? data.email.trim() : '')
    setLogoUrl(resolveStoredAssetUrl(data.logo_url, BRANDING_ASSET_HOST))
    setCoverUrl(resolveStoredAssetUrl(data.cover_image_url, BRANDING_ASSET_HOST))
  }, [])

  // SINGLE SOURCE OF TRUTH: /api/bnb/partner/me
  const loadPartnerMe = useCallback(async () => {
    const res = await authFetch(apiUrl('/api/bnb/partner/me'), {
      headers: { Accept: 'application/json' },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const d = data?.detail
      throw new Error(typeof d === 'string' ? d : 'Could not load B&B profile')
    }
    const next = { id: data.id, referral_code: String(data.referral_code || '').trim() }
    try {
      localStorage.setItem('bnb', JSON.stringify(next))
    } catch {
      /* ignore */
    }
    setBnb(next)
    applyMePayload(data)
    return next
  }, [applyMePayload])

  // BNB BRANDING UPLOAD (logo + cover)
  async function handleLogoUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return

    const formData = new FormData()
    formData.append('file', file)

    const res = await authFetch(uploadLogoUrl(), {
      method: 'POST',
      body: formData,
    })

    const data = await res.json().catch(() => ({}))
    if (e.target) e.target.value = ''
    if (!res.ok || typeof data.logo_url !== 'string') return
    const path = data.logo_url.trim().startsWith('/') ? data.logo_url.trim() : `/${data.logo_url.trim()}`
    setLogoUrl(`${BRANDING_ASSET_HOST}${path}`)
    await load()
  }

  async function handleCoverUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return

    const formData = new FormData()
    formData.append('file', file)

    const res = await authFetch(uploadCoverUrl(), {
      method: 'POST',
      body: formData,
    })

    const data = await res.json().catch(() => ({}))
    if (e.target) e.target.value = ''
    if (!res.ok || typeof data.cover_url !== 'string') return
    const path = data.cover_url.trim().startsWith('/') ? data.cover_url.trim() : `/${data.cover_url.trim()}`
    setCoverUrl(`${BRANDING_ASSET_HOST}${path}`)
    await load()
  }

  async function saveBranding() {
    setBrandError('')
    setBrandSaving(true)
    try {
      const res = await authFetch(apiUrl('/api/bnb/me'), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          display_name: name.trim() || null,
          logo_url: logoUrl.trim() || null,
          cover_image_url: coverUrl.trim() || null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const d = data?.detail
        setBrandError(typeof d === 'string' ? d : 'Salvataggio non riuscito.')
        return
      }
      if (data?.id != null) {
        const next = { id: data.id, referral_code: String(data.referral_code || '').trim() }
        try {
          localStorage.setItem('bnb', JSON.stringify(next))
        } catch {
          /* ignore */
        }
        setBnb(next)
      }
      applyMePayload(data)
    } catch {
      setBrandError('Salvataggio non riuscito.')
    } finally {
      setBrandSaving(false)
    }
  }

  const loadEarnings = useCallback(async (bnbRow) => {
    if (!bnbRow?.id) {
      setEarnings(null)
      return
    }
    const q = new URLSearchParams({ bnb_id: String(bnbRow.id) })
    const res = await authFetch(apiUrl(`/api/bnb/earnings?${q}`), {
      headers: { Accept: 'application/json' },
    })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const d = data?.detail
        throw new Error(typeof d === 'string' ? d : 'Could not load earnings')
      }
      setEarnings(data)
  }, [])

  const loadTours = useCallback(async () => {
    const res = await authFetch(apiUrl('/api/tours'), { headers: { Accept: 'application/json' } })
    const data = await res.json().catch(() => [])
    if (!res.ok) {
      setTours([])
      return
    }
    setTours(Array.isArray(data) ? data : [])
  }, [])

  const load = useCallback(async () => {
    setError('')
    setLoading(true)
    try {
      const row = await loadPartnerMe()
      await Promise.all([loadEarnings(row), loadTours()])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }, [loadPartnerMe, loadEarnings, loadTours])

  useEffect(() => {
    void load()
  }, [load])

  const referralCode = (bnb?.referral_code || earnings?.referral_code || '').trim()

  const headerCoverSrc = useMemo(() => {
    const u = resolveMediaUrl(coverUrl)
    return u || '/cover-placeholder.jpg'
  }, [coverUrl])

  const headerLogoSrc = useMemo(() => resolveMediaUrl(logoUrl), [logoUrl])

  const overlayBtnStyle = {
    position: 'absolute',
    bottom: 12,
    right: 12,
    background: 'rgba(0, 0, 0, 0.6)',
    color: '#fff',
    fontSize: '0.75rem',
    padding: '4px 12px',
    borderRadius: 8,
    border: 'none',
    cursor: 'pointer',
    fontWeight: 600,
    WebkitTapHighlightColor: 'transparent',
  }

  const heroShellStyle = {
    borderRadius: 16,
    overflow: 'hidden',
    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    marginBottom: 24,
    background: '#fff',
  }

  const referralLink = useMemo(() => {
    if (!referralCode) return ''
    return `http://${referralCode.toLowerCase()}.localhost:5173`
  }, [referralCode])

  const totalBookings = earnings?.total_bookings ?? 0
  const totalEarningsEur = earnings?.total_bnb_earnings ?? 0

  return (
    <main style={pageStyle}>
      {error ? (
        <p style={{ color: '#b91c1c', fontSize: '0.9rem', margin: '0 0 12px' }} role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p style={{ color: '#64748b', margin: 0 }}>Loading…</p>
      ) : (
        <>
          {/* BNB BRANDING UPLOAD (logo + cover) */}
          <input
            type="file"
            id="logoUpload"
            className="hidden"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => void handleLogoUpload(e)}
          />
          <input
            type="file"
            id="coverUpload"
            className="hidden"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => void handleCoverUpload(e)}
          />
          <div style={heroShellStyle}>
            <div style={{ position: 'relative', height: 160 }}>
              <img
                src={headerCoverSrc}
                alt=""
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block',
                }}
              />
              <button
                type="button"
                style={overlayBtnStyle}
                onClick={() => document.getElementById('coverUpload')?.click()}
              >
                Cambia cover
              </button>
            </div>
            <div style={{ padding: '12px 16px 20px', position: 'relative' }}>
              <div
                style={{
                  marginTop: -56,
                  marginBottom: 8,
                  display: 'flex',
                  alignItems: 'flex-end',
                  gap: 16,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ position: 'relative', width: 88, height: 88, flexShrink: 0 }}>
                  {headerLogoSrc ? (
                    <img
                      src={headerLogoSrc}
                      alt=""
                      style={{
                        width: 88,
                        height: 88,
                        objectFit: 'cover',
                        borderRadius: 16,
                        border: '4px solid #fff',
                        boxShadow: '0 4px 12px rgb(0 0 0 / 0.15)',
                        display: 'block',
                        background: '#f1f5f9',
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 88,
                        height: 88,
                        borderRadius: 16,
                        border: '4px solid #fff',
                        boxShadow: '0 4px 12px rgb(0 0 0 / 0.15)',
                        background: '#e2e8f0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#64748b',
                        fontSize: '0.65rem',
                        fontWeight: 600,
                        textAlign: 'center',
                        padding: 6,
                      }}
                    >
                      Logo
                    </div>
                  )}
                  <button
                    type="button"
                    aria-label="Cambia logo"
                    onClick={() => document.getElementById('logoUpload')?.click()}
                    style={{
                      ...overlayBtnStyle,
                      bottom: 6,
                      right: 6,
                      padding: '2px 8px',
                      fontSize: '0.65rem',
                    }}
                  >
                    Modifica
                  </button>
                </div>
                <div style={{ flex: 1, minWidth: 200, paddingBottom: 4 }}>
                  <h1
                    style={{
                      margin: '0 0 4px',
                      fontSize: '1.35rem',
                      color: '#0f172a',
                      fontWeight: 700,
                    }}
                  >
                    {name.trim() || 'B&B dashboard'}
                  </h1>
                  <p style={{ margin: '0 0 4px', color: '#64748b', fontSize: '0.9rem' }}>
                    {email || '—'}
                  </p>
                  {referralCode ? (
                    <p
                      style={{
                        margin: 0,
                        fontSize: '0.8rem',
                        color: '#475569',
                        fontFamily: 'ui-monospace, monospace',
                      }}
                    >
                      Referral: <strong>{referralCode}</strong>
                    </p>
                  ) : null}
                  <p style={{ margin: '8px 0 0', color: '#94a3b8', fontSize: '0.8rem' }}>
                    Earnings, referral link, QR, and per-tour links for your guests.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <section style={sectionStyle} aria-labelledby="brand-heading">
            <h2
              id="brand-heading"
              style={{ margin: '0 0 8px', fontSize: '1.35rem', fontWeight: 800, color: '#0f172a' }}
            >
              Personalizza la tua pagina
            </h2>
            {brandError ? (
              <p style={{ color: '#b91c1c', fontSize: '0.9rem', margin: '0 0 12px' }}>{brandError}</p>
            ) : null}
            <div style={{ marginTop: 30 }}>
              <h3 style={{ margin: '0 0 16px', fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>
                Personalizza la tua pagina
              </h3>

              <label style={{ ...brandFieldLabelStyle, marginTop: 0 }}>Nome struttura</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={brandTextInputStyle}
                autoComplete="organization"
              />

              <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: '#64748b', lineHeight: 1.45 }}>
                Logo e copertina: usa i pulsanti nell&apos;intestazione in alto.
              </p>

              <button
                type="button"
                style={{ ...copyButtonStyle, marginTop: 20 }}
                disabled={brandSaving}
                onClick={() => void saveBranding()}
              >
                {brandSaving ? 'Salvataggio…' : 'Salva'}
              </button>
            </div>
          </section>

          <section style={sectionStyle} aria-labelledby="stats-heading">
            <h2 id="stats-heading" style={headingStyle}>
              Performance
            </h2>
            <div style={statsGridStyle}>
              <div>
                <p style={statLabelStyle}>Total bookings</p>
                <p style={statValueStyle}>{totalBookings}</p>
                <p style={{ margin: '6px 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>
                  Confirmed bookings linked to your B&amp;B
                </p>
              </div>
              <div>
                <p style={statLabelStyle}>Total earnings</p>
                <p style={statValueStyle}>
                  €
                  {Number(totalEarningsEur).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
                <p style={{ margin: '6px 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>
                  Your share from recorded card payments
                </p>
              </div>
            </div>
          </section>

          <section style={sectionStyle} aria-label="Il tuo link e QR">
            {!referralCode ? (
              <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>
                No referral code on your profile yet. Ask an administrator to set{' '}
                <strong>referral_code</strong> on your B&amp;B provider record.
              </p>
            ) : (
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
            )}
          </section>

          <section style={sectionStyle} aria-labelledby="tours-heading">
            <h2 id="tours-heading" style={headingStyle}>
              Tours — share with referral
            </h2>
            {tours.length === 0 ? (
              <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>No active tours.</p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {tours.map((t) => {
                  const id = t.id
                  const title = t.title || `Tour #${id}`
                  const path = referralCode
                    ? `/tours/${id}?ref=${encodeURIComponent(referralCode)}`
                    : `/tours/${id}`
                  const href =
                    typeof window !== 'undefined' ? `${window.location.origin}${path}` : path
                  return (
                    <li key={id} style={tourRowStyle}>
                      <span style={{ fontWeight: 600, color: '#0f172a' }}>{title}</span>
                      <a href={href} style={{ fontSize: '0.85rem', color: '#2563eb', wordBreak: 'break-all' }}>
                        {href}
                      </a>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  )
}
