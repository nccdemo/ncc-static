import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import axios from '../api/axios'
import { apiUrl } from '../api/apiUrl.js'
import { getStoredReferralCode } from '../utils/referralStorage'

function normalizeImageSrc(path) {
  if (path == null || path === '') return ''
  const s = String(path).trim()
  if (!s) return ''
  if (s.startsWith('http://') || s.startsWith('https://')) return s
  return apiUrl(s.startsWith('/') ? s : `/${s}`)
}

/** ``YYYY-MM-DD`` from instance row ``date`` (ISO datetime or date string). */
function isoDateOnly(raw) {
  if (raw == null || raw === '') return ''
  const s = String(raw)
  if (s.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  try {
    const d = new Date(s)
    if (!Number.isNaN(d.getTime())) {
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${y}-${m}-${day}`
    }
  } catch {
    /* ignore */
  }
  return ''
}

export default function TourDetailPage() {
  const { id } = useParams()
  const [tour, setTour] = useState(null)
  const [instances, setInstances] = useState([])
  const [instancesLoading, setInstancesLoading] = useState(true)
  const [instancesErr, setInstancesErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [slide, setSlide] = useState(0)
  const touchStartX = useRef(null)

  const [selectedDate, setSelectedDate] = useState('')
  const [people, setPeople] = useState(1)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [checkoutErr, setCheckoutErr] = useState('')

  const tourId = useMemo(() => {
    const n = parseInt(String(id || ''), 10)
    return Number.isFinite(n) && n > 0 ? n : null
  }, [id])

  useEffect(() => {
    if (tourId == null) {
      setErr('Tour non valido')
      setLoading(false)
      return
    }
    let cancelled = false
    ;(async () => {
      setErr('')
      setLoading(true)
      try {
        const { data } = await axios.get(`/tours/${tourId}`)
        if (!cancelled) setTour(data)
      } catch (e) {
        if (!cancelled) {
          const status = e?.response?.status
          setErr(status === 404 ? 'Tour non trovato.' : 'Impossibile caricare il tour. Riprova tra poco.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tourId])

  useEffect(() => {
    if (tourId == null) return
    let cancelled = false
    ;(async () => {
      setInstancesErr('')
      setInstancesLoading(true)
      try {
        const { data } = await axios.get(`/tours/${tourId}/instances`)
        if (!cancelled) setInstances(Array.isArray(data) ? data : [])
      } catch (e) {
        if (!cancelled) setInstancesErr('Date non disponibili al momento.')
        if (!cancelled) setInstances([])
      } finally {
        if (!cancelled) setInstancesLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tourId])

  const bookableRows = useMemo(() => {
    return instances.filter((row) => {
      const av = Number(row?.available_seats ?? row?.available ?? 0)
      const st = String(row?.status || '').toLowerCase()
      if (st && ['cancelled', 'canceled', 'completed'].includes(st)) return false
      return av > 0
    })
  }, [instances])

  const dateBounds = useMemo(() => {
    const days = bookableRows.map((r) => isoDateOnly(r.date)).filter(Boolean).sort()
    if (!days.length) return { min: '', max: '' }
    return { min: days[0], max: days[days.length - 1] }
  }, [bookableRows])

  useEffect(() => {
    if (!selectedDate && dateBounds.min) {
      setSelectedDate(dateBounds.min)
    }
  }, [dateBounds.min, selectedDate])

  const maxSeatsForDay = useMemo(() => {
    if (!selectedDate) return 0
    const rows = bookableRows.filter((r) => isoDateOnly(r.date) === selectedDate)
    if (!rows.length) return 0
    return Math.max(...rows.map((r) => Number(r?.available_seats ?? r?.available ?? 0)))
  }, [bookableRows, selectedDate])

  useEffect(() => {
    setPeople((p) => Math.min(Math.max(1, p), Math.max(1, maxSeatsForDay || 1)))
  }, [maxSeatsForDay])

  const images = useMemo(() => {
    const raw = Array.isArray(tour?.images) ? tour.images : []
    const urls = raw.map(normalizeImageSrc).filter(Boolean)
    if (urls.length === 0) {
      return ['https://picsum.photos/800/600']
    }
    return urls
  }, [tour])

  useEffect(() => {
    setSlide(0)
  }, [images])

  const goPrev = useCallback(() => {
    setSlide((i) => (i <= 0 ? images.length - 1 : i - 1))
  }, [images.length])

  const goNext = useCallback(() => {
    setSlide((i) => (i >= images.length - 1 ? 0 : i + 1))
  }, [images.length])

  const onTouchStart = (e) => {
    touchStartX.current = e.touches[0]?.clientX ?? null
  }

  const onTouchEnd = (e) => {
    if (touchStartX.current == null) return
    const endX = e.changedTouches[0]?.clientX
    if (endX == null) return
    const dx = endX - touchStartX.current
    touchStartX.current = null
    if (dx < -48) goNext()
    else if (dx > 48) goPrev()
  }

  const basePrice = tour != null && tour.price != null ? Number(tour.price) : 0
  const checkoutPrice = Math.round(basePrice * 1.25 * 100) / 100
  const bookable = tour?.active !== false

  async function handleBookNow() {
    if (tourId == null || !selectedDate || maxSeatsForDay < 1) return
    setCheckoutErr('')
    setCheckoutLoading(true)
    try {
      const body = {
        tour_id: tourId,
        date: selectedDate,
        people: Math.min(Math.max(1, people), maxSeatsForDay),
      }
      const ref = getStoredReferralCode()
      if (ref) body.referral_code = ref

      const { data } = await axios.post('/payments/create-checkout-session', body)
      const url = data?.checkout_url || data?.url
      if (!url || typeof url !== 'string') {
        setCheckoutErr('Risposta pagamento non valida.')
        return
      }
      window.location.href = url
    } catch (e) {
      const msg =
        e?.response?.data?.detail ||
        (typeof e?.response?.data?.detail === 'object' ? JSON.stringify(e.response.data.detail) : null) ||
        e?.message ||
        'Pagamento non disponibile.'
      setCheckoutErr(typeof msg === 'string' ? msg : 'Pagamento non disponibile.')
    } finally {
      setCheckoutLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="tour-detail tour-detail--loading">
        <p className="tour-detail-muted">Caricamento…</p>
      </div>
    )
  }

  if (err || !tour) {
    return (
      <div className="tour-detail">
        <p className="banner-err" role="alert">
          {err || 'Tour non disponibile.'}
        </p>
        <p style={{ marginTop: '1.25rem' }}>
          <Link to="/tours">Vedi date disponibili</Link>
        </p>
      </div>
    )
  }

  const canCheckout =
    bookable && !instancesLoading && !instancesErr && maxSeatsForDay > 0 && Boolean(selectedDate)

  return (
    <article className="tour-detail">
      <div
        className="tour-detail-gallery"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        role="region"
        aria-roledescription="carousel"
        aria-label="Immagini del tour"
      >
        <div className="tour-detail-gallery-frame">
          <img
            key={slide}
            className="tour-detail-gallery-img"
            src={images[slide]}
            alt={tour.title ? `${tour.title} — foto ${slide + 1}` : 'Tour'}
            decoding="async"
            loading={slide === 0 ? 'eager' : 'lazy'}
          />
          {images.length > 1 ? (
            <>
              <button type="button" className="tour-detail-nav tour-detail-nav--prev" onClick={goPrev} aria-label="Immagine precedente">
                ‹
              </button>
              <button type="button" className="tour-detail-nav tour-detail-nav--next" onClick={goNext} aria-label="Immagine successiva">
                ›
              </button>
            </>
          ) : null}
        </div>
        {images.length > 1 ? (
          <div className="tour-detail-dots" role="tablist" aria-label="Seleziona immagine">
            {images.map((_, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === slide}
                className={`tour-detail-dot${i === slide ? ' tour-detail-dot--active' : ''}`}
                onClick={() => setSlide(i)}
                aria-label={`Immagine ${i + 1}`}
              />
            ))}
          </div>
        ) : null}
      </div>

      <div className="tour-detail-body">
        <h1 className="tour-detail-title">{tour.title}</h1>
        {tour.city ? <p className="tour-detail-city">📍 {tour.city}</p> : null}
        {!bookable ? (
          <p className="banner-warn" role="status">
            Questo tour non è al momento prenotabile.
          </p>
        ) : null}
        {tour.description ? (
          <div className="tour-detail-desc">
            {String(tour.description)
              .split(/\n+/)
              .map((p, i) => (
                <p key={i}>{p}</p>
              ))}
          </div>
        ) : (
          <p className="tour-detail-muted">Scegli la data e il numero di partecipanti, poi vai al pagamento sicuro con Stripe.</p>
        )}

        <div className="tour-detail-price-block">
          <p className="tour-detail-price-label">Da</p>
          <p className="tour-detail-price">
            €{checkoutPrice.toFixed(2)}
            <span className="tour-detail-price-unit"> / persona al checkout</span>
          </p>
          <p className="tour-detail-price-hint">Prezzo base operatore €{basePrice.toFixed(2)} + oneri listino.</p>
        </div>

        <div className="tour-detail-booking">
          <h2 className="tour-detail-booking-title">Prenota</h2>
          {instancesLoading ? <p className="tour-detail-muted">Caricamento date…</p> : null}
          {instancesErr ? <p className="banner-err">{instancesErr}</p> : null}
          {!instancesLoading && !instancesErr && bookableRows.length === 0 ? (
            <p className="tour-detail-muted">
              Nessuna data con posti liberi. <Link to="/tours">Vedi tutte le partenze</Link>
            </p>
          ) : null}

          {!instancesLoading && !instancesErr && bookableRows.length > 0 ? (
            <>
              <label className="tour-detail-field" htmlFor="tour-date">
                Data
              </label>
              <input
                id="tour-date"
                className="tour-detail-input"
                type="date"
                min={dateBounds.min || undefined}
                max={dateBounds.max || undefined}
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />

              <label className="tour-detail-field" htmlFor="tour-people">
                Partecipanti
              </label>
              <input
                id="tour-people"
                className="tour-detail-input"
                type="number"
                inputMode="numeric"
                min={1}
                max={Math.max(1, maxSeatsForDay)}
                value={people}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10)
                  if (Number.isNaN(n)) return
                  setPeople(Math.min(Math.max(1, n), Math.max(1, maxSeatsForDay)))
                }}
              />
              <p className="tour-detail-hint">
                {maxSeatsForDay > 0
                  ? `Massimo ${maxSeatsForDay} posti per la data scelta.`
                  : 'Nessun posto per questa data.'}
              </p>
            </>
          ) : null}

          {checkoutErr ? (
            <p className="banner-err" role="alert">
              {checkoutErr}
            </p>
          ) : null}

          <button
            type="button"
            className="btn btn-primary tour-detail-cta"
            disabled={!canCheckout || checkoutLoading}
            onClick={handleBookNow}
          >
            {checkoutLoading ? 'Reindirizzamento…' : 'Book Now'}
          </button>
        </div>

        <p className="tour-detail-foot">
          <Link to="/tours">← Lista date</Link>
        </p>
      </div>
    </article>
  )
}
