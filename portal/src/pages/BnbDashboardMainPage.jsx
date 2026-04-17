import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { QRCodeSVG as QRCode, QRCodeCanvas } from 'qrcode.react'

import { apiUrl, brandingPathForApi } from '../api/apiUrl.js'
import { authFetch } from '../api/authFetch.js'
import { uploadCoverUrl, uploadLogoUrl } from '../api/uploadConfig.js'

const TOURS_PUBLIC_ORIGIN =
  import.meta.env.VITE_TOURS_PUBLIC_BASE_URL?.replace(/\/$/, '') || 'http://localhost:5173'

const mainStyle = {
  padding: '24px 16px 48px',
  maxWidth: 640,
  margin: '0 auto',
  width: '100%',
  boxSizing: 'border-box',
}

const cardStyle = {
  background: '#fff',
  borderRadius: 12,
  padding: '18px 16px',
  marginBottom: 16,
  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08)',
  border: '1px solid #e2e8f0',
}

const bigSectionStyle = {
  ...cardStyle,
  padding: '24px 20px',
}

const labelStyle = {
  margin: '0 0 8px',
  fontSize: '0.75rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: '#64748b',
}

const copyBtnStyle = {
  marginTop: 16,
  width: '100%',
  minHeight: 48,
  padding: '14px 18px',
  borderRadius: 8,
  border: 'none',
  background: '#0f172a',
  color: '#fff',
  fontSize: '0.95rem',
  fontWeight: 600,
  cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent',
}

const secondaryBtnStyle = {
  ...copyBtnStyle,
  marginTop: 12,
  border: '2px solid #0f172a',
  background: '#fff',
  color: '#0f172a',
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxSizing: 'border-box',
}

/** ``PUT /api/bnb/me`` (branding text/URLs). */
function bnbMeUpdateUrl() {
  return apiUrl('/api/bnb/me')
}

// SINGLE SOURCE OF TRUTH: /api/bnb/partner/me
function partnerMeUrl() {
  return apiUrl('/api/bnb/partner/me')
}

function historyUrl() {
  return apiUrl('/api/payments/by-referral?bnb_id=me')
}

const EMPTY_COVER_PLACEHOLDER =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><rect fill="#e2e8f0" width="100%" height="100%"/></svg>',
  )

export default function BnbDashboardMainPage() {
  const [me, setMe] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [historyRows, setHistoryRows] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [copied, setCopied] = useState(false)
  const copiedRef = useRef(0)

  const [brandDisplayName, setBrandDisplayName] = useState('')
  const [brandLogoUrl, setBrandLogoUrl] = useState('')
  const [brandCoverUrl, setBrandCoverUrl] = useState('')
  const [publicSlug, setPublicSlug] = useState('')
  const [brandSaving, setBrandSaving] = useState(false)
  const [brandError, setBrandError] = useState('')
  const [brandUploading, setBrandUploading] = useState('')
  const [brandSavedPreview, setBrandSavedPreview] = useState(false)
  const [mediaRev, setMediaRev] = useState(0)

  const load = useCallback(async () => {
    setError('')
    setLoading(true)
    try {
      // SINGLE SOURCE OF TRUTH: /api/bnb/partner/me
      const res = await authFetch(partnerMeUrl(), { headers: { Accept: 'application/json' } })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const d = data?.detail
        setError(typeof d === 'string' ? d : 'Impossibile caricare il profilo.')
        setMe(null)
        return
      }
      setMe(data)
      try {
        if (data?.id != null) {
          localStorage.setItem(
            'bnb',
            JSON.stringify({
              id: data.id,
              referral_code: String(data.referral_code || '').trim(),
            }),
          )
        }
      } catch {
        /* ignore */
      }
    } catch {
      setError('Impossibile raggiungere il server.')
      setMe(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!me) return
    setBrandDisplayName(String(me.display_name ?? '').trim())
    setBrandLogoUrl(String(me.logo_url ?? '').trim())
    setBrandCoverUrl(String(me.cover_image_url ?? '').trim())
    setPublicSlug(String(me.public_slug ?? '').trim())
    setBrandSavedPreview(false)
  }, [me])

  useEffect(() => {
    if (!me) return undefined
    let cancelled = false
    setHistoryLoading(true)
    setHistoryError('')
    ;(async () => {
      try {
        const res = await authFetch(historyUrl(), { headers: { Accept: 'application/json' } })
        const data = await res.json().catch(() => [])
        if (cancelled) return
        if (!res.ok) {
          const d = data?.detail
          setHistoryError(typeof d === 'string' ? d : 'Storico non disponibile.')
          setHistoryRows([])
          return
        }
        const rows = Array.isArray(data) ? data : []
        rows.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
        setHistoryRows(rows)
      } catch {
        if (!cancelled) {
          setHistoryError('Storico non disponibile.')
          setHistoryRows([])
        }
      } finally {
        if (!cancelled) setHistoryLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [me])

  useEffect(() => {
    return () => window.clearTimeout(copiedRef.current)
  }, [])

  const email = (me?.email || '').trim() || 'ospite'
  const referral = String(me?.referral_code || '').trim()
  const total = Number(me?.total_earnings ?? 0)
  const totalLabel = Number.isFinite(total) ? total.toFixed(2) : '0.00'
  const hasPositiveEarnings = Number.isFinite(total) && total > 0

  const affiliateLink = useMemo(() => {
    if (!referral) return `${TOURS_PUBLIC_ORIGIN}/tours`
    return `${TOURS_PUBLIC_ORIGIN}/tours?ref=${encodeURIComponent(referral)}`
  }, [referral])

  const publicQrPageUrl = useMemo(() => {
    if (!referral) return ''
    return `${TOURS_PUBLIC_ORIGIN}/bnb/qr/${encodeURIComponent(referral)}`
  }, [referral])

  const referralLink = useMemo(() => {
    if (!referral) return ''
    return `http://${referral.toLowerCase()}.localhost:5173`
  }, [referral])

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(affiliateLink)
    setCopied(true)
    window.clearTimeout(copiedRef.current)
    copiedRef.current = window.setTimeout(() => setCopied(false), 2000)
  }, [affiliateLink])

  const uploadLogoFile = useCallback(async (file) => {
    setBrandError('')
    setBrandUploading('logo')
    try {
      const formData = new FormData()
      formData.append('file', file)
      // authFetch strips Content-Type for FormData so multipart boundary is set by the browser.
      const res = await authFetch(uploadLogoUrl(), { method: 'POST', body: formData })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const d = data?.detail
        setBrandError(typeof d === 'string' ? d : 'Caricamento logo non riuscito.')
        return false
      }
      const raw =
        (typeof data?.logo_url === 'string' ? data.logo_url.trim() : '') ||
        (typeof data?.url === 'string' ? data.url.trim() : '')
      if (!raw) {
        setBrandError('Risposta upload non valida.')
        return false
      }
      const path = raw.startsWith('/') ? raw : `/${raw}`
      setBrandLogoUrl(path)
      setBrandSavedPreview(false)
      setMediaRev((n) => n + 1)
      return true
    } catch {
      setBrandError('Caricamento logo non riuscito.')
      return false
    } finally {
      setBrandUploading('')
    }
  }, [])

  const uploadCoverFile = useCallback(async (file) => {
    setBrandError('')
    setBrandUploading('cover')
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await authFetch(uploadCoverUrl(), { method: 'POST', body: formData })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const d = data?.detail
        setBrandError(typeof d === 'string' ? d : 'Caricamento copertina non riuscito.')
        return false
      }
      const raw = typeof data?.cover_url === 'string' ? data.cover_url.trim() : ''
      if (!raw) {
        setBrandError('Risposta upload non valida.')
        return false
      }
      const path = raw.startsWith('/') ? raw : `/${raw}`
      setBrandCoverUrl(path)
      setMediaRev((n) => n + 1)
      return true
    } catch {
      setBrandError('Caricamento copertina non riuscito.')
      return false
    } finally {
      setBrandUploading('')
    }
  }, [])

  const saveBranding = useCallback(async () => {
    setBrandError('')
    setBrandSaving(true)
    try {
      const res = await authFetch(bnbMeUpdateUrl(), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          display_name: brandDisplayName.trim() || null,
          logo_url: brandingPathForApi(brandLogoUrl),
          cover_image_url: brandingPathForApi(brandCoverUrl),
          public_slug: publicSlug.trim() ? publicSlug.trim().toLowerCase() : null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const d = data?.detail
        setBrandError(typeof d === 'string' ? d : 'Salvataggio non riuscito.')
        return
      }
      setMe(data)
      setBrandSavedPreview(true)
      setMediaRev((n) => n + 1)
    } catch {
      setBrandError('Salvataggio non riuscito.')
    } finally {
      setBrandSaving(false)
    }
  }, [brandCoverUrl, brandDisplayName, brandLogoUrl, publicSlug])

  // BNB BRANDING UPLOAD (logo + cover)
  const handleLogoUpload = useCallback(
    async (e) => {
      const file = e.target.files?.[0]
      if (!file) return
      const ok = await uploadLogoFile(file)
      if (e.target) e.target.value = ''
      if (ok) await load()
    },
    [uploadLogoFile, load],
  )

  const handleCoverUpload = useCallback(
    async (e) => {
      const file = e.target.files?.[0]
      if (!file) return
      const ok = await uploadCoverFile(file)
      if (e.target) e.target.value = ''
      if (ok) await load()
    },
    [uploadCoverFile, load],
  )

  const headerDisplayName = useMemo(
    () => String(brandDisplayName || me?.display_name || '').trim(),
    [brandDisplayName, me?.display_name],
  )

  const headerLogoSrc = useMemo(() => {
    const raw = String(brandLogoUrl || me?.logo_url || '').trim()
    if (!raw) return ''
    return `${apiUrl(raw)}?r=${mediaRev}`
  }, [brandLogoUrl, me?.logo_url, mediaRev])

  const headerCoverSrc = useMemo(() => {
    const raw = String(brandCoverUrl || me?.cover_image_url || '').trim()
    if (!raw) return EMPTY_COVER_PLACEHOLDER
    return `${apiUrl(raw)}?r=${mediaRev}`
  }, [brandCoverUrl, me?.cover_image_url, mediaRev])

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

  const inputStyle = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '12px 14px',
    borderRadius: 8,
    border: '1px solid #cbd5e1',
    fontSize: '0.95rem',
    marginTop: 4,
  }

  const fieldLabelStyle = { ...labelStyle, marginBottom: 4 }

  return (
    <main style={mainStyle}>
      {loading ? (
        <p style={{ color: '#64748b', margin: 0 }}>Caricamento…</p>
      ) : error ? (
        <div>
          <p style={{ color: '#b91c1c', margin: '0 0 12px' }}>{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            style={{
              padding: '10px 16px',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              background: '#fff',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Riprova
          </button>
        </div>
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
            <div style={{ position: 'relative', height: 250 }}>
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
                disabled={!!brandUploading}
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
                <div style={{ position: 'relative', width: 120, minHeight: 88, flexShrink: 0 }}>
                  {headerLogoSrc ? (
                    <img
                      src={headerLogoSrc}
                      alt=""
                      style={{
                        width: 120,
                        height: 'auto',
                        maxHeight: 120,
                        objectFit: 'contain',
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
                        width: 120,
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
                    disabled={!!brandUploading}
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
                    {headerDisplayName || `Ciao, ${email}`}
                  </h1>
                  <p style={{ margin: '0 0 4px', color: '#64748b', fontSize: '0.9rem' }}>{email}</p>
                  {referral ? (
                    <p
                      style={{
                        margin: 0,
                        fontSize: '0.8rem',
                        color: '#475569',
                        fontFamily: 'ui-monospace, monospace',
                      }}
                    >
                      Referral: <strong>{referral}</strong>
                    </p>
                  ) : null}
                  <p style={{ margin: '8px 0 0', color: '#94a3b8', fontSize: '0.8rem' }}>
                    Il tuo spazio partner B&amp;B.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <section style={bigSectionStyle} aria-labelledby="branding-heading">
            <h2
              id="branding-heading"
              style={{
                margin: '0 0 16px',
                fontSize: '1.2rem',
                fontWeight: 800,
                color: '#0f172a',
              }}
            >
              Personalizza la tua pagina
            </h2>
            <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: '0.9rem', lineHeight: 1.5 }}>
              Nome e immagini mostrati ai clienti sulla landing pubblica (referral).
            </p>
            {brandError ? (
              <p style={{ color: '#b91c1c', margin: '0 0 12px', fontSize: '0.9rem' }}>{brandError}</p>
            ) : null}
            <div style={{ marginBottom: 16 }}>
              <label htmlFor="bnb-display-name" style={fieldLabelStyle}>
                Nome struttura
              </label>
              <input
                id="bnb-display-name"
                type="text"
                value={brandDisplayName}
                onChange={(e) => {
                  setBrandDisplayName(e.target.value)
                  setBrandSavedPreview(false)
                }}
                placeholder="Es. Sanculino Hotel"
                style={inputStyle}
                autoComplete="organization"
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label htmlFor="bnb-public-slug" style={fieldLabelStyle}>
                URL pubblico (slug)
              </label>
              <input
                id="bnb-public-slug"
                type="text"
                value={publicSlug}
                onChange={(e) => {
                  setPublicSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
                  setBrandSavedPreview(false)
                }}
                placeholder="es. sanculino"
                style={inputStyle}
                autoCapitalize="none"
                spellCheck={false}
              />
              <p style={{ margin: '6px 0 0', fontSize: '0.78rem', color: '#94a3b8', lineHeight: 1.4 }}>
                Link per gli ospiti:{' '}
                <strong style={{ color: '#475569' }}>
                  {(import.meta.env.VITE_CLIENT_PUBLIC_BASE_URL || TOURS_PUBLIC_ORIGIN).replace(/\/$/, '')}
                  /bnb/
                  {publicSlug.trim() || 'tuo-slug'}
                </strong>
                . Solo lettere minuscole, numeri e trattini (3–64 caratteri). Lascia vuoto per disattivare.
              </p>
            </div>
            {brandUploading ? (
              <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: '#64748b' }}>
                Caricamento immagine…
              </p>
            ) : null}
            <p style={{ margin: '0 0 16px', fontSize: '0.85rem', color: '#64748b', lineHeight: 1.45 }}>
              Logo e copertina: usa i pulsanti nell&apos;intestazione in alto.
            </p>
            <button
              type="button"
              style={copyBtnStyle}
              disabled={brandSaving || !!brandUploading}
              onClick={() => void saveBranding()}
            >
              {brandSaving ? 'Salvataggio…' : 'Salva'}
            </button>

            {brandSavedPreview ? (
              <div
                style={{
                  marginTop: 24,
                  paddingTop: 20,
                  borderTop: '1px solid #e2e8f0',
                }}
              >
                <p style={{ ...labelStyle, marginBottom: 12 }}>Anteprima</p>
                <div
                  style={{
                    borderRadius: 12,
                    overflow: 'hidden',
                    border: '1px solid #e2e8f0',
                    background: '#f8fafc',
                    textAlign: 'center',
                  }}
                >
                  {String(me?.cover_image_url || '').trim() ? (
                    <img
                      src={`${apiUrl(String(me.cover_image_url).trim())}?r=${mediaRev}`}
                      alt=""
                      style={{ width: '100%', height: 200, objectFit: 'cover', display: 'block' }}
                    />
                  ) : null}
                  <div style={{ padding: '16px 14px' }}>
                    {String(brandLogoUrl || me?.logo_url || '').trim() ? (
                      <img
                        src={`${apiUrl(String(brandLogoUrl || me?.logo_url).trim())}?r=${mediaRev}`}
                        alt={me?.display_name || 'Logo'}
                        style={{
                          width: '120px',
                          height: 'auto',
                          objectFit: 'contain',
                          marginBottom: 10,
                        }}
                      />
                    ) : null}
                    <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
                      {(me?.display_name || '').trim() || 'Nome struttura'}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
          </section>

          <section style={cardStyle} aria-labelledby="earnings-label">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                flexWrap: 'wrap',
                marginBottom: 8,
              }}
            >
              <p id="earnings-label" style={{ ...labelStyle, margin: 0 }}>
                Guadagni
              </p>
              {hasPositiveEarnings ? (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '4px 10px',
                    borderRadius: 9999,
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    background: '#d1fae5',
                    color: '#047857',
                    border: '1px solid #6ee7b7',
                  }}
                >
                  Attivo
                </span>
              ) : null}
            </div>
            <p style={{ margin: '0 0 8px', fontSize: '1.5rem', fontWeight: 700, color: '#0f172a' }}>
              Guadagni totali: €{totalLabel}
            </p>
            {!hasPositiveEarnings ? (
              <p style={{ margin: 0, fontSize: '0.95rem', color: '#64748b', lineHeight: 1.45 }}>
                Inizia a condividere il tuo link
              </p>
            ) : null}
          </section>

          <section style={cardStyle} aria-labelledby="ref-label">
            <p id="ref-label" style={labelStyle}>
              Codice referral
            </p>
            {referral ? (
              <p
                style={{
                  margin: 0,
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  fontFamily: 'ui-monospace, monospace',
                  letterSpacing: '0.04em',
                  color: '#0f172a',
                }}
              >
                {referral}
              </p>
            ) : (
              <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>
                Nessun codice assegnato. Contatta l&apos;amministratore.
              </p>
            )}
          </section>

          <section style={bigSectionStyle} aria-labelledby="link-heading">
            <h2
              id="link-heading"
              style={{
                margin: '0 0 16px',
                fontSize: '1.35rem',
                fontWeight: 800,
                color: '#0f172a',
                letterSpacing: '-0.02em',
              }}
            >
              Il tuo link
            </h2>
            {referral ? (
              <>
                <p
                  style={{
                    margin: '0 0 12px',
                    fontSize: '0.95rem',
                    fontWeight: 600,
                    color: '#334155',
                    textAlign: 'center',
                  }}
                >
                  Mostra questo QR ai clienti
                </p>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    marginBottom: 20,
                  }}
                >
                  <QRCode value={affiliateLink} size={180} />
                </div>
                <a
                  href={affiliateLink}
                  style={{
                    display: 'block',
                    wordBreak: 'break-all',
                    fontSize: '1rem',
                    lineHeight: 1.5,
                    color: '#2563eb',
                    fontWeight: 500,
                  }}
                >
                  {affiliateLink}
                </a>
                <button type="button" style={copyBtnStyle} onClick={handleCopy}>
                  {copied ? 'Copiato!' : 'Copia link'}
                </button>
                {publicQrPageUrl ? (
                  <a
                    href={publicQrPageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={secondaryBtnStyle}
                  >
                    Scarica QR
                  </a>
                ) : null}
                <div
                  style={{
                    marginTop: 24,
                    paddingTop: 20,
                    borderTop: '1px solid #e2e8f0',
                  }}
                >
                  <h3 style={{ margin: '0 0 8px', fontSize: '1.05rem', color: '#0f172a' }}>
                    Il tuo link
                  </h3>
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
                      fontSize: '0.95rem',
                      marginBottom: 12,
                    }}
                  />
                  <button
                    type="button"
                    style={secondaryBtnStyle}
                    onClick={() => navigator.clipboard.writeText(referralLink)}
                  >
                    Copia link
                  </button>
                  <h3 style={{ margin: '20px 0 12px', fontSize: '1.05rem', color: '#0f172a' }}>
                    QR Code
                  </h3>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <QRCodeCanvas value={referralLink} size={200} />
                  </div>
                </div>
              </>
            ) : (
              <p style={{ margin: 0, color: '#64748b', fontSize: '0.95rem' }}>
                Aggiungi un codice referral al tuo profilo per generare il link.
              </p>
            )}
          </section>

          <section style={cardStyle} aria-labelledby="history-heading">
            <h2
              id="history-heading"
              style={{
                margin: '0 0 12px',
                fontSize: '1rem',
                fontWeight: 700,
                color: '#0f172a',
              }}
            >
              Storico pagamenti
            </h2>
            {historyLoading ? (
              <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>Caricamento storico…</p>
            ) : historyError ? (
              <p style={{ margin: 0, color: '#b45309', fontSize: '0.9rem' }}>{historyError}</p>
            ) : (
              <div style={{ overflowX: 'auto', margin: '0 -4px' }}>
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: '0.875rem',
                    minWidth: 280,
                  }}
                >
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                      <th style={{ padding: '8px 6px', color: '#64748b', fontWeight: 700 }}>Cliente</th>
                      <th style={{ padding: '8px 6px', color: '#64748b', fontWeight: 700 }}>Tour</th>
                      <th style={{ padding: '8px 6px', color: '#64748b', fontWeight: 700 }}>Data</th>
                      <th
                        style={{
                          padding: '8px 6px',
                          color: '#64748b',
                          fontWeight: 700,
                          textAlign: 'right',
                        }}
                      >
                        Guadagno €
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyRows.length === 0 ? (
                      <tr>
                        <td colSpan={4} style={{ padding: '16px 6px', color: '#64748b' }}>
                          Nessun pagamento registrato.
                        </td>
                      </tr>
                    ) : (
                      historyRows.map((row, idx) => (
                        <tr
                          key={`${row.date}-${row.customer_name}-${idx}`}
                          style={{ borderBottom: '1px solid #f1f5f9' }}
                        >
                          <td style={{ padding: '10px 6px', verticalAlign: 'top' }}>
                            {row.customer_name || '—'}
                          </td>
                          <td style={{ padding: '10px 6px', verticalAlign: 'top' }}>{row.tour || '—'}</td>
                          <td
                            style={{
                              padding: '10px 6px',
                              verticalAlign: 'top',
                              fontVariantNumeric: 'tabular-nums',
                              color: '#475569',
                            }}
                          >
                            {row.date || '—'}
                          </td>
                          <td
                            style={{
                              padding: '10px 6px',
                              textAlign: 'right',
                              fontVariantNumeric: 'tabular-nums',
                              fontWeight: 600,
                            }}
                          >
                            € {Number(row.amount || 0).toFixed(2)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  )
}
