import { useCallback, useEffect, useState } from 'react'

import {
  BNB_UPLOAD_COVER_URL,
  BNB_UPLOAD_LOGO_URL,
  getBnbPartnerMe,
  getBnbPartnerSummary,
  updateBnbMe,
} from '../api/client.js'
import { apiUrl, brandingPathForApi } from '../api/apiUrl.js'
import { getToken, redirectToLogin, referralLinkForCode } from '../auth/storage.js'

function formatMoney(n) {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(Number(n) || 0)
}

export default function BnbDashboard() {
  const [summary, setSummary] = useState(null)
  const [err, setErr] = useState('')

  /** Stored paths only (e.g. ``/uploads/bnb/...``) for API + display via ``apiUrl``. */
  const [logoPath, setLogoPath] = useState(null)
  const [coverPath, setCoverPath] = useState(null)
  const [mediaRev, setMediaRev] = useState(0)
  const [name, setName] = useState('')
  const [brandSaving, setBrandSaving] = useState(false)
  const [brandErr, setBrandErr] = useState('')

  const loadProfile = useCallback(async () => {
    const me = await getBnbPartnerMe()
    const display = me?.display_name != null ? String(me.display_name).trim() : ''
    setName(display)
    setLogoPath(brandingPathForApi(me?.logo_url))
    setCoverPath(brandingPathForApi(me?.cover_image_url))
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

    setLogoPath(brandingPathForApi(data.logo_url))
    setBrandErr('')
    setMediaRev((n) => n + 1)
    try {
      await loadProfile()
    } catch {
      /* stato locale già aggiornato */
    }
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

    setCoverPath(brandingPathForApi(data.cover_url))
    setBrandErr('')
    setMediaRev((n) => n + 1)
    try {
      await loadProfile()
    } catch {
      /* stato locale già aggiornato */
    }
  }

  async function saveBranding() {
    setBrandErr('')
    setBrandSaving(true)
    try {
      await updateBnbMe({
        display_name: name.trim() || null,
        logo_url: logoPath,
        cover_image_url: coverPath,
      })
      setMediaRev((n) => n + 1)
      await loadProfile()
    } catch (e) {
      setBrandErr(e?.message || 'Salvataggio non riuscito.')
    } finally {
      setBrandSaving(false)
    }
  }

  const code = summary?.referral_code || ''
  const link = referralLinkForCode(code)

  const logoSrc = logoPath ? `${apiUrl(logoPath)}?r=${mediaRev}` : ''
  const coverSrc = coverPath ? `${apiUrl(coverPath)}?r=${mediaRev}` : ''

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

        {logoSrc ? (
          <img
            src={logoSrc}
            alt=""
            style={{ width: '120px', height: 'auto', marginTop: 10, display: 'block', objectFit: 'contain' }}
          />
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

        {coverSrc ? (
          <img
            src={coverSrc}
            alt=""
            style={{
              width: '100%',
              maxWidth: 640,
              height: '250px',
              marginTop: 10,
              display: 'block',
              objectFit: 'cover',
              borderRadius: 8,
            }}
          />
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
