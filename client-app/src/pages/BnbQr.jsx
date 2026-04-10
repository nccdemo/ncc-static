import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { QRCodeCanvas } from 'qrcode.react'

const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')

export default function BnbQr() {
  const { code } = useParams()
  const [copied, setCopied] = useState(false)
  const [brand, setBrand] = useState(null)

  const normalized = useMemo(() => String(code || '').trim(), [code])
  const link = useMemo(() => {
    if (!normalized) return ''
    return `http://${normalized.toLowerCase()}.localhost:5173`
  }, [normalized])

  useEffect(() => {
    let cancelled = false
    async function loadBrand() {
      if (!normalized) {
        setBrand(null)
        return
      }
      try {
        const url = `${API_BASE}/api/bnb/public?code=${encodeURIComponent(normalized)}`
        const res = await fetch(url, { headers: { Accept: 'application/json' } })
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok || !data || typeof data !== 'object') {
          setBrand(null)
          return
        }
        setBrand({
          display_name: String(data.display_name || '').trim(),
          logo_url: String(data.logo_url || '').trim(),
          cover_image_url: String(data.cover_image_url || '').trim(),
        })
      } catch {
        if (!cancelled) setBrand(null)
      }
    }
    void loadBrand()
    return () => {
      cancelled = true
    }
  }, [normalized])

  const displayName = brand?.display_name || ''
  const logoUrl = brand?.logo_url || ''
  const coverUrl = brand?.cover_image_url || ''
  const hasCover = Boolean(coverUrl)
  const subtitleLine = displayName
    ? `Esperienze consigliate da ${displayName}`
    : normalized
      ? `Esperienze consigliate da ${normalized}`
      : 'Esperienze consigliate dalla tua struttura'

  const heroBgStyle =
    hasCover && coverUrl
      ? {
          backgroundImage: `url("${coverUrl.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`,
        }
      : undefined

  async function onCopy() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore
    }
  }

  function onPrint() {
    window.print()
  }

  return (
    <div className="landing bnb-qr-page">
      <div className="qr-print">
        <div
          className={`bnb-qr-hero ${hasCover ? 'bnb-qr-hero--cover' : 'bnb-qr-hero--default'}`}
          style={heroBgStyle}
        >
          {hasCover ? <div className="bnb-qr-hero-overlay" aria-hidden /> : null}
          <div className="bnb-qr-hero-inner">
            {logoUrl ? (
              <img src={logoUrl} alt={displayName || 'Logo'} className="bnb-qr-logo" />
            ) : null}
            {displayName || normalized ? (
              <div className="qr-bnb-name">{displayName || normalized}</div>
            ) : null}
            <h1 className="landing-title bnb-qr-title">Scansiona e prenota</h1>
            <p className="landing-subtitle bnb-qr-subtitle">{subtitleLine}</p>
            <p className="qr-print-message">Scansiona e prenota la tua esperienza</p>
          </div>
        </div>

        {link ? (
          <>
            <div className="qr-wrap" aria-label="QR code">
              <QRCodeCanvas value={link} size={240} />
            </div>

            <div className="qr-link print-hide">
              <code>{link}</code>
            </div>

            <div className="landing-actions print-hide" style={{ marginTop: 0 }}>
              <button type="button" className="btn btn-primary" onClick={() => void onCopy()}>
                Copia link
              </button>
              <button type="button" className="btn btn-ghost" onClick={onPrint}>
                Stampa QR
              </button>
              <Link to="/" className="btn btn-ghost">
                Vai al sito
              </Link>
            </div>
            {copied ? <p className="landing-muted print-hide">Copiato.</p> : null}
          </>
        ) : (
          <p className="landing-muted print-hide">Codice non valido.</p>
        )}
      </div>
    </div>
  )
}
