import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  getStoredReferralCode,
  persistReferralFromHost,
  persistReferralFromUrlSearch,
} from '../utils/referralStorage'

import { apiUrl } from '../api/apiUrl.js'

export default function Landing() {
  const { search } = useLocation()
  const [brand, setBrand] = useState(null)
  const [activeRef, setActiveRef] = useState(() => getStoredReferralCode())

  useEffect(() => {
    persistReferralFromUrlSearch(search)
    persistReferralFromHost()
    setActiveRef(getStoredReferralCode())
  }, [search])

  useEffect(() => {
    if (!activeRef) return
    // eslint-disable-next-line no-console
    console.log('BNB MODE ACTIVE:', activeRef)
  }, [activeRef])

  useEffect(() => {
    if (!activeRef || typeof window === 'undefined') return
    const dedupeKey = `ncc_referral_visit:${activeRef}`
    const last = sessionStorage.getItem(dedupeKey)
    const now = Date.now()
    if (last && now - Number(last) < 4000) return
    sessionStorage.setItem(dedupeKey, String(now))
    void fetch(apiUrl('/api/referral/visit'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ referral_code: activeRef }),
    }).catch(() => {
      /* non-blocking */
    })
  }, [activeRef])

  useEffect(() => {
    let cancelled = false
    async function loadBrand() {
      if (!activeRef) {
        setBrand(null)
        return
      }
      try {
        const res = await fetch(
          apiUrl(`/api/bnb/by-referral/${encodeURIComponent(activeRef)}`),
          { headers: { Accept: 'application/json' } },
        )
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok) {
          setBrand(null)
          return
        }
        if (!data || typeof data !== 'object') {
          setBrand(null)
          return
        }
        setBrand({
          name: String(data.name || '').trim(),
          logo_url: String(data.logo_url || '').trim() || null,
          cover_image_url: String(data.cover_image_url || '').trim() || null,
        })
      } catch {
        if (!cancelled) setBrand(null)
      }
    }
    void loadBrand()
    return () => {
      cancelled = true
    }
  }, [activeRef])

  const bnbMode = Boolean(activeRef)
  const name =
    (brand?.name && String(brand.name).trim()) ||
    (activeRef ? String(activeRef).trim() : '') ||
    'La tua struttura partner'
  const logoUrlRaw = brand?.logo_url ? String(brand.logo_url).trim() : ''
  const logoUrl = logoUrlRaw ? apiUrl(logoUrlRaw) : ''
  const coverImagePathRaw = brand?.cover_image_url ? String(brand.cover_image_url).trim() : ''
  const coverImageUrl = coverImagePathRaw ? apiUrl(coverImagePathRaw) : ''
  const hasCoverImage = Boolean(coverImageUrl)
  const bookingViaName = name

  const heroBody = (
    <>
      {bnbMode ? <div className="landing-title-label">Consigliato dalla tua struttura</div> : null}
      <p className="landing-subtitle">
        {bnbMode ? 'Selezionate direttamente dalla tua struttura' : 'Prenota il tuo posto'}
      </p>
    </>
  )

  const landingRest = (
    <>
      <p className="landing-lead">
        Scegli una data disponibile, indica quante persone e paga in sicurezza con Stripe. Se arrivi da un
        B&amp;B partner, il codice referral viene applicato automaticamente.
      </p>

      {bnbMode ? (
        <div className="bnb-info-box" role="note" aria-label="Informazioni partner">
          <div className="bnb-info-kicker">Prenotazione tramite:</div>
          <div className="bnb-info-name">{bookingViaName}</div>
        </div>
      ) : (
        <p className="landing-muted">
          Nessun codice referral. Puoi aprire un link con <code>?ref=CODICE</code> per attribuire la
          prenotazione a un partner.
        </p>
      )}

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

  if (bnbMode) {
    return (
      <div className="landing-bnb">
        <div className="landing-bnb-branding-banner">
          {logoUrl ? (
            <img src={logoUrl} alt={name} style={{ width: '120px', height: 'auto', objectFit: 'contain' }} />
          ) : null}
          <h3 className="landing-bnb-branding-title">Esperienze consigliate da {name}</h3>
        </div>
        <div
          className={`landing-hero ${hasCoverImage ? 'landing-hero--cover' : 'landing-hero--default'}`}
          style={
            hasCoverImage && coverImageUrl
              ? {
                  backgroundImage: `url("${coverImageUrl.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`,
                }
              : undefined
          }
        >
          {hasCoverImage ? <div className="landing-hero-overlay" aria-hidden /> : null}
          <div className="landing-hero-inner">{heroBody}</div>
        </div>
        <div className="landing landing-bnb-rest">{landingRest}</div>
      </div>
    )
  }

  return (
    <div className="landing">
      <p className="landing-eyebrow">Tour in Italia</p>
      <h1 className="landing-title">NCC Tour</h1>
      {heroBody}
      {landingRest}
    </div>
  )
}
