import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { apiUrl } from '../api/apiUrl.js'
import { persistReferralCode } from '../utils/referralStorage'

/**
 * ``GET /api/bnb/public-by-slug/{slug}`` → branding + referral; persists referral for checkout/tours.
 */
export default function BnbPublicLandingPage() {
  const { slug } = useParams()
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setErr('')
    setData(null)
    setLoading(true)
    const raw = (slug || '').trim()
    if (!raw) {
      setErr('Slug mancante.')
      setLoading(false)
      return () => {
        cancelled = true
      }
    }
    void (async () => {
      try {
        const res = await fetch(
          apiUrl(`/api/bnb/public-by-slug/${encodeURIComponent(raw)}`),
          { headers: { Accept: 'application/json' } },
        )
        const j = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok) {
          const d = j?.detail
          setErr(typeof d === 'string' ? d : 'Struttura non trovata.')
          setLoading(false)
          return
        }
        setData(j)
      } catch {
        if (!cancelled) setErr('Impossibile caricare la pagina.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [slug])

  useEffect(() => {
    if (!data?.referral_code || typeof window === 'undefined') return
    const rc = String(data.referral_code).trim().toUpperCase()
    if (!rc) return
    persistReferralCode(rc)
    const dedupeKey = `ncc_referral_visit:${rc}`
    const last = sessionStorage.getItem(dedupeKey)
    const now = Date.now()
    if (last && now - Number(last) < 4000) return
    sessionStorage.setItem(dedupeKey, String(now))
    void fetch(apiUrl('/api/referral/visit'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ referral_code: rc }),
    }).catch(() => {})
  }, [data])

  if (loading) {
    return (
      <div className="landing">
        <p className="landing-muted">Caricamento…</p>
      </div>
    )
  }

  if (err) {
    return (
      <div className="landing">
        <h1 className="landing-title">Pagina non disponibile</h1>
        <p className="landing-muted">{err}</p>
        <div className="landing-actions" style={{ marginTop: 24 }}>
          <Link to="/explore" className="btn btn-primary">
            Torna alla home
          </Link>
        </div>
      </div>
    )
  }

  const name = String(data?.display_name || '').trim() || 'La tua struttura partner'
  const logoUrlRaw = data?.logo_url ? String(data.logo_url).trim() : ''
  const coverUrlRaw = data?.cover_image_url ? String(data.cover_image_url).trim() : ''
  const hasCover = Boolean(coverUrlRaw)

  const heroBody = (
    <>
      <div className="landing-title-label">Consigliato dalla tua struttura</div>
      <p className="landing-subtitle">Selezionate direttamente dalla tua struttura</p>
    </>
  )

  const landingRest = (
    <>
      <p className="landing-lead">
        Scegli una data disponibile, indica quante persone e paga in sicurezza con Stripe. Il referral del tuo
        B&amp;B è già attivo su questa sessione.
      </p>
      <div className="bnb-info-box" role="note" aria-label="Informazioni partner">
        <div className="bnb-info-kicker">Prenotazione tramite:</div>
        <div className="bnb-info-name">{name}</div>
      </div>
      <div className="landing-actions">
        <Link to="/tours" className="btn btn-primary">
          Vedi date disponibili
        </Link>
        <Link to="/map" className="btn btn-ghost">
          Mappa veicoli
        </Link>
      </div>
    </>
  )

  return (
    <div className="landing-bnb">
      <div className="landing-bnb-branding-banner">
        {logoUrlRaw ? (
          <img src={logoUrlRaw} alt={name} style={{ width: '120px', height: 'auto', objectFit: 'contain' }} />
        ) : null}
        <h3 className="landing-bnb-branding-title">Esperienze consigliate da {name}</h3>
      </div>
      <div
        className={`landing-hero ${hasCover ? 'landing-hero--cover' : 'landing-hero--default'}`}
        style={
          hasCover
            ? {
                backgroundImage: `url("${coverUrlRaw.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`,
              }
            : undefined
        }
      >
        {hasCover ? <div className="landing-hero-overlay" aria-hidden /> : null}
        <div className="landing-hero-inner">{heroBody}</div>
      </div>
      <div className="landing landing-bnb-rest">{landingRest}</div>
    </div>
  )
}
