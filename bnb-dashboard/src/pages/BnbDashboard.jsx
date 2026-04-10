import { useCallback, useEffect, useState } from 'react'

import {
  API_ORIGIN,
  BNB_UPLOAD_COVER_URL,
  BNB_UPLOAD_LOGO_URL,
  getBnbPartnerMe,
  getBnbPartnerSummary,
  updateBnbMe,
} from '../api/client.js'
import { getToken, redirectToLogin, referralLinkForCode } from '../auth/storage.js'

function formatMoney(n) {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(Number(n) || 0)
}

function resolveAssetUrl(pathOrUrl) {
  if (pathOrUrl == null || typeof pathOrUrl !== 'string') return null
  const s = pathOrUrl.trim()
  if (!s) return null
  if (s.startsWith('http://') || s.startsWith('https://')) return s
  return `${API_BASE}${s.startsWith('/') ? s : `/${s}`}`
}

export default function BnbDashboard() {
  const [summary, setSummary] = useState(null)
  const [err, setErr] = useState('')

  const [logoUrl, setLogoUrl] = useState(null)
  const [coverUrl, setCoverUrl] = useState(null)
  const [name, setName] = useState('')
  const [brandSaving, setBrandSaving] = useState(false)
  const [brandErr, setBrandErr] = useState('')

  const loadProfile = useCallback(async () => {
    const me = await getBnbPartnerMe()
    const display = me?.display_name != null ? String(me.display_name).trim() : ''
    setName(display)
    setLogoUrl(resolveAssetUrl(me?.logo_url))
    setCoverUrl(resolveAssetUrl(me?.cover_image_url))
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await loadProfile()
        const s = await getBnbPartnerSummary()
        if (!cancelled) setSummary(s)
      } catch (e) {
        if (!cancelled) setErr(e?.message || 'Caricamento fallito')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loadProfile])

  async function handleLogoUpload(e) {
    const file = e.target.files?.[0]
    if (e.target) e.target.value = ''
    if (!file) return

    const formData = new FormData()
    formData.append('file', file)

    const token = getToken()
    const headers = {}
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }
    // Do not set Content-Type — required for multipart/form-data boundary.
    const res = await fetch(BNB_UPLOAD_LOGO_URL, {
      method: 'POST',
      body: formData,
      headers,
    })

    if (res.status === 401 || res.status === 403) {
      redirectToLogin()
      return
    }

    const data = await res.json().catch(() => ({}))
    if (!res.ok || typeof data.logo_url !== 'string') {
      setBrandErr(typeof data?.detail === 'string' ? data.detail : 'Caricamento logo non riuscito.')
      return
    }

    const path = String(data.logo_url).trim().startsWith('/')
      ? String(data.logo_url).trim()
      : `/${String(data.logo_url).trim()}`
    setLogoUrl(`${API_ORIGIN}${path}`)
    setBrandErr('')
  }

  async function handleCoverUpload(e) {
    const file = e.target.files?.[0]
    if (e.target) e.target.value = ''
    if (!file) return

    const formData = new FormData()
    formData.append('file', file)

    const token = getToken()
    const headers = {}
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }
    // Do not set Content-Type — required for multipart/form-data boundary.
    const res = await fetch(BNB_UPLOAD_COVER_URL, {
      method: 'POST',
      body: formData,
      headers,
    })

    const data = await res.json().catch(() => ({}))

    if (res.status === 401 || res.status === 403) {
      redirectToLogin()
      return
    }
    if (!res.ok || typeof data.cover_url !== 'string') {
      setBrandErr(typeof data?.detail === 'string' ? data.detail : 'Caricamento copertina non riuscito.')
      return
    }

    const path = String(data.cover_url).trim().startsWith('/')
      ? String(data.cover_url).trim()
      : `/${String(data.cover_url).trim()}`
    setCoverUrl(`${API_ORIGIN}${path}`)
    setBrandErr('')
  }

  async function saveBranding() {
    setBrandErr('')
    setBrandSaving(true)
    try {
      const logoForApi =
        logoUrl && logoUrl.startsWith(API_ORIGIN) ? logoUrl.slice(API_ORIGIN.length) || null : logoUrl
      const coverForApi =
        coverUrl && coverUrl.startsWith(API_ORIGIN) ? coverUrl.slice(API_ORIGIN.length) || null : coverUrl
      await updateBnbMe({
        display_name: name.trim() || null,
        logo_url: logoForApi || null,
        cover_image_url: coverForApi || null,
      })
      await loadProfile()
    } catch (e) {
      setBrandErr(e?.message || 'Salvataggio non riuscito.')
    } finally {
      setBrandSaving(false)
    }
  }

  const code = summary?.referral_code || ''
  const link = referralLinkForCode(code)

  return (
    <div>
      <div className="page-head">
        <h1>Dashboard</h1>
        <p>Riepilogo prenotazioni confermate e link di invito.</p>
      </div>

      {err ? <div className="err">{err}</div> : null}

      <div style={{ marginTop: 40 }}>
        <h2>Personalizza la tua pagina</h2>

        {brandErr ? <div className="err" style={{ marginTop: 12 }}>{brandErr}</div> : null}

        <div className="field" style={{ marginTop: 16 }}>
          <label htmlFor="bnb-brand-name">Nome struttura</label>
          <input
            id="bnb-brand-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="organization"
          />
        </div>

        <div className="field" style={{ marginTop: 16 }}>
          <label htmlFor="bnb-brand-logo">Logo</label>
          <input id="bnb-brand-logo" type="file" accept="image/jpeg,image/png,image/webp" onChange={handleLogoUpload} />
        </div>

        {logoUrl ? (
          <img src={logoUrl} alt="" style={{ width: 120, marginTop: 10, display: 'block', objectFit: 'contain' }} />
        ) : null}

        <div className="field" style={{ marginTop: 16 }}>
          <label htmlFor="bnb-brand-cover">Immagine copertina</label>
          <input
            id="bnb-brand-cover"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleCoverUpload}
          />
        </div>

        {coverUrl ? (
          <img src={coverUrl} alt="" style={{ width: 200, marginTop: 10, display: 'block', objectFit: 'cover', borderRadius: 8 }} />
        ) : null}

        <div className="btn-row" style={{ marginTop: 16 }}>
          <button type="button" className="btn btn-primary" disabled={brandSaving} onClick={() => void saveBranding()}>
            {brandSaving ? 'Salvataggio…' : 'Salva'}
          </button>
        </div>
      </div>

      <div className="grid-stats" style={{ marginTop: '1.5rem' }}>
        <div className="stat">
          <div className="stat-value">{code || '—'}</div>
          <div className="stat-label">Codice referral</div>
        </div>
        <div className="stat">
          <div className="stat-value">{summary != null ? summary.total_bookings : '…'}</div>
          <div className="stat-label">Prenotazioni confermate</div>
        </div>
        <div className="stat">
          <div className="stat-value">
            {summary != null ? formatMoney(summary.total_earnings) : '…'}
          </div>
          <div className="stat-label">Totale prenotazioni (importo)</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: '1.25rem' }}>
        <h2>Link referral</h2>
        {link ? (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              Condividi questo link con gli ospiti (app client su porta 5173).
            </p>
            <div className="link-box">{link}</div>
            <div className="btn-row">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => navigator.clipboard.writeText(link)}
              >
                Copia link
              </button>
            </div>
          </>
        ) : (
          <p className="muted">Nessun codice referral associato al profilo.</p>
        )}
      </div>
    </div>
  )
}
