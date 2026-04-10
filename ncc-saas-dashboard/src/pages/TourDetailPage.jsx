import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { api } from '../lib/api.js'
import { checkoutSessionErrorMessage } from '../lib/checkoutError.js'
import { getStoredReferralCode, persistReferralFromUrlSearch } from '../lib/referralStorage.js'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog.jsx'
import { Button } from '../components/ui/button.jsx'
import { Input } from '../components/ui/input.jsx'
import { getImageUrl } from '../lib/media.js'

const API_BASE_URL = '/api'

function formatPriceEUR(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  return `${value}€`
}

function getTourImageUrl(tour) {
  const imgs = Array.isArray(tour?.images) ? tour.images.filter(Boolean) : []
  const hero = imgs[0]
  if (hero) return getImageUrl(hero)
  return '/placeholder.jpg'
}

/** Inline validation for contact + party size (shown after field blur). */
function validateContactAndPeople(values) {
  const errors = {}

  if (!values.name.trim()) errors.name = 'Name is required'

  if (!values.email.trim()) {
    errors.email = 'Email is required'
  } else if (!/^\S+@\S+\.\S+$/.test(values.email.trim())) {
    errors.email = 'Enter a valid email'
  }

  if (!values.phone.trim()) errors.phone = 'Phone is required'

  const p = Number(values.passengers)
  if (!Number.isFinite(p) || p < 1) {
    errors.passengers = 'Passengers must be at least 1'
  }

  return errors
}

export function TourDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [tour, setTour] = useState(null)
  const [instances, setInstances] = useState([])
  const [selectedInstance, setSelectedInstance] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [stripeCheckoutLoadingId, setStripeCheckoutLoadingId] = useState(null)
  const [activeImage, setActiveImage] = useState(null)

  const [reserveOpen, setReserveOpen] = useState(false)
  const [reserveInstance, setReserveInstance] = useState(null)
  const [reserveSeats, setReserveSeats] = useState(1)
  const [reserveStep, setReserveStep] = useState('form')
  const [reserveResult, setReserveResult] = useState(null)
  const [reserveError, setReserveError] = useState(null)
  const [reserveSubmitting, setReserveSubmitting] = useState(false)
  const [paySubmitting, setPaySubmitting] = useState(false)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [passengers, setPassengers] = useState(1)

  const [touched, setTouched] = useState({})

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [tourRes, instancesRes] = await Promise.all([
          api.get(`/api/tours/${id}`),
          api.get(`/api/tours/${id}/instances`),
        ])
        if (cancelled) return
        setTour(tourRes.data ?? null)
        setInstances(Array.isArray(instancesRes.data) ? instancesRes.data : [])
      } catch (e) {
        if (cancelled) return
        setError(e?.response?.data?.detail ?? e?.message ?? 'Failed to load tour')
        setTour(null)
        setInstances([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    if (id) load()
    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => {
    if (!instances.length) return
    if (selectedInstance) return
    const firstAvailable = instances.find((i) => (Number(i.available) || 0) > 0) ?? null
    if (firstAvailable) {
      setSelectedInstance(firstAvailable)
    }
  }, [instances, selectedInstance])

  const imageList = useMemo(() => {
    const imgs = Array.isArray(tour?.images) ? tour.images.filter(Boolean) : []
    return imgs.length ? imgs.slice(0, 5) : []
  }, [tour])
  const imgUrl = useMemo(() => getImageUrl(activeImage || imageList[0] || '/placeholder.jpg'), [activeImage, imageList])

  useEffect(() => {
    const first = imageList[0] || null
    setActiveImage(first)
  }, [imageList])

  const fieldErrors = useMemo(
    () => validateContactAndPeople({ name, email, phone, passengers }),
    [name, email, phone, passengers],
  )

  function markTouched(key) {
    setTouched((prev) => ({ ...prev, [key]: true }))
  }

  const showError = (key) => Boolean(fieldErrors[key] && touched[key])

  const quickBookFieldsOk = Boolean(name.trim() && email.trim() && phone.trim())
  const people = Number(passengers)
  const peopleOk = Number.isFinite(people) && people >= 1

  function instanceAvailabilityStyle(inst) {
    const available = Number(inst?.available) || 0
    if (available === 0)
      return {
        card: 'border-red-500/40 bg-red-950/50 text-red-100',
        accent: 'text-red-200',
        labelBg: 'bg-red-500/20 text-red-100',
      }
    if (available <= 2)
      return {
        card: 'border-amber-500/40 bg-amber-950/40 text-amber-50',
        accent: 'text-amber-200',
        labelBg: 'bg-amber-500/25 text-amber-100',
      }
    return {
      card: 'border-emerald-500/35 bg-emerald-950/35 text-emerald-50',
      accent: 'text-emerald-200',
      labelBg: 'bg-emerald-500/20 text-emerald-100',
    }
  }

  function instanceStatusLabel(inst) {
    const available = Number(inst?.available) || 0
    if (available === 0) return 'SOLD OUT'
    if (available <= 2) return 'ULTIMI POSTI'
    return null
  }

  async function reloadInstances() {
    const { data } = await api.get(`/api/tours/${id}/instances`)
    setInstances(Array.isArray(data) ? data : [])
  }

  function openReserveModal(inst) {
    const available = Number(inst?.available ?? inst?.available_seats) || 0
    if (available <= 0) return
    const n = Number(passengers)
    const p = Number.isFinite(n) && n >= 1 ? n : 1
    setReserveInstance(inst)
    setReserveSeats(Math.min(p, available))
    setReserveStep('form')
    setReserveResult(null)
    setReserveError(null)
    setReserveOpen(true)
  }

  function onReserveOpenChange(open) {
    setReserveOpen(open)
    if (!open) {
      setReserveInstance(null)
      setReserveStep('form')
      setReserveResult(null)
      setReserveError(null)
    }
  }

  function closeReserve() {
    onReserveOpenChange(false)
  }

  const handleReserveSubmit = async () => {
    const inst = reserveInstance
    if (!inst) return
    const available = Number(inst?.available ?? inst?.available_seats) || 0

    if (!name.trim() || !email.trim() || !phone.trim()) {
      setReserveError('Compila nome, email e telefono nel modulo a destra.')
      return
    }
    const emailTrimmed = email.trim()
    if (!/^\S+@\S+\.\S+$/.test(emailTrimmed)) {
      setReserveError('Inserisci un indirizzo email valido.')
      return
    }

    const n = Number(reserveSeats)
    if (!Number.isFinite(n) || n < 1) {
      setReserveError('Il numero di posti deve essere almeno 1.')
      return
    }
    if (n > available) {
      setReserveError('Posti non disponibili per questa data.')
      return
    }

    setReserveSubmitting(true)
    setReserveError(null)
    try {
      const { data } = await api.post('/api/bookings/', {
        tour_instance_id: inst.id,
        seats_booked: n,
        customer_name: name.trim(),
        email: emailTrimmed,
        phone: phone.trim(),
        tour_id: Number(id),
        date: inst.date,
        time: '09:00:00',
      })
      setReserveResult(data)
      setReserveStep('summary')
      await reloadInstances()
    } catch (e) {
      const d = e?.response?.data?.detail
      const msg =
        typeof d === 'string'
          ? d
          : Array.isArray(d)
            ? d.map((x) => (typeof x === 'string' ? x : x?.msg ?? JSON.stringify(x))).join(', ')
            : e?.message ?? 'Errore di rete'
      setReserveError(msg)
    } finally {
      setReserveSubmitting(false)
    }
  }

  const handlePaySimulated = async () => {
    const bid = reserveResult?.id
    if (bid == null) return
    setPaySubmitting(true)
    setReserveError(null)
    try {
      await api.post(`/api/bookings/${bid}/pay`)
      setReserveStep('paid')
      await reloadInstances()
    } catch (e) {
      const d = e?.response?.data?.detail
      setReserveError(typeof d === 'string' ? d : e?.message ?? 'Pagamento non riuscito')
    } finally {
      setPaySubmitting(false)
    }
  }

  const handleCheckout = async (inst) => {
    const available = Number(inst?.available) || 0
    if (available <= 0) return

    if (!name.trim() || !email.trim() || !phone.trim()) {
      alert('Compila tutti i campi obbligatori')
      return
    }
    const emailTrimmed = email.trim()
    if (!/^\S+@\S+\.\S+$/.test(emailTrimmed)) {
      alert('Inserisci un indirizzo email valido')
      return
    }

    const n = Number(passengers)
    if (!Number.isFinite(n) || n < 1) {
      alert('Inserisci un numero valido di partecipanti (minimo 1)')
      return
    }
    if (n > available) {
      alert('Non ci sono abbastanza posti disponibili per questa data')
      return
    }

    setStripeCheckoutLoadingId(inst.id)
    try {
      persistReferralFromUrlSearch(typeof window !== 'undefined' ? window.location.search : '')
      const referral_code = getStoredReferralCode() ?? null

      const res = await api.post(`/api/payments/create-checkout`, {
        tour_instance_id: inst.id,
        people: n,
        customer_name: name.trim(),
        email: emailTrimmed,
        referral_code,
        has_bnb: Boolean(referral_code),
      })
      const data = res?.data ?? {}

      if (data.url) {
        window.location.href = data.url
      } else {
        alert('Risposta server senza URL di pagamento')
      }
    } catch (e) {
      alert(checkoutSessionErrorMessage(e))
    } finally {
      setStripeCheckoutLoadingId(null)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-100">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Link to="/public/tours" className="text-sm font-semibold tracking-tight hover:text-white">
            NCC Demo
          </Link>
          <div className="text-xs sm:text-sm text-slate-300">Tour details</div>
        </div>
      </header>

      {loading ? (
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 text-center text-sm text-slate-300">
          Loading…
        </div>
      ) : error ? (
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10">
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
          <div className="mt-6">
            <Link
              to="/public/tours"
              className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-100 hover:bg-white/10"
            >
              Back to tours
            </Link>
          </div>
        </div>
      ) : !tour ? (
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 text-center text-sm text-slate-300">
          Tour not found
        </div>
      ) : (
        <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-10">
            <section className="lg:col-span-7">
              <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-sm">
                <div className="relative aspect-[16/9] overflow-hidden bg-slate-900/60">
                  <img
                    src={imgUrl}
                    alt={tour.title ?? `Tour #${tour.id}`}
                    className="h-full w-full object-cover"
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.onerror = null
                      e.currentTarget.src = '/placeholder.jpg'
                    }}
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
                </div>

                {imageList.length > 1 ? (
                  <div className="p-4 sm:p-5">
                    <div className="grid grid-cols-5 gap-2">
                      {imageList.slice(0, 5).map((u, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setActiveImage(u)}
                          className={[
                            'aspect-square overflow-hidden rounded-xl border bg-white/5 transition',
                            u === (activeImage || imageList[0])
                              ? 'border-white/30 ring-2 ring-white/40'
                              : 'border-white/10 hover:border-white/20',
                          ].join(' ')}
                        >
                          <img
                            src={getImageUrl(u)}
                            alt={`${tour.title ?? 'Tour'} ${idx + 1}`}
                            className="h-full w-full object-cover"
                            loading="lazy"
                            onError={(e) => {
                              e.currentTarget.onerror = null
                              e.currentTarget.src = '/placeholder.jpg'
                            }}
                          />
                        </button>
                      ))}
                    </div>
                    <div className="mt-2 text-xs text-slate-300">
                      {Math.min(5, imageList.length)}/5 images
                    </div>
                  </div>
                ) : null}

                <div className="p-6 sm:p-8">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
                        {tour.title ?? '—'}
                      </h1>
                      <p className="mt-2 text-sm sm:text-base text-slate-300">
                        {tour.description ?? '—'}
                      </p>
                    </div>

                    <div className="shrink-0 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                      <div className="text-xs uppercase tracking-wide text-slate-300">From</div>
                      <div className="text-lg font-semibold text-white">{formatPriceEUR(tour.price)}</div>
                    </div>
                  </div>

                  <div className="mt-6 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                    <div className="text-sm font-semibold">What happens next</div>
                    <ul className="mt-2 space-y-1.5 text-sm text-slate-300">
                      <li>1) Compila nome, email, telefono e partecipanti</li>
                      <li>2) Scegli la data e clicca Prenota — i posti vengono riservati subito</li>
                      <li>3) Completa con Paga ora (simulato) oppure usa Stripe Checkout</li>
                    </ul>
                  </div>
                </div>
              </div>
            </section>

            <aside className="lg:col-span-5">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-sm sm:p-8 lg:sticky lg:top-24">
                <div className="flex items-baseline justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold">Book this tour</div>
                    <div className="mt-1 text-xs text-slate-300">Pagamento sicuro con Stripe</div>
                  </div>
                  <div className="text-sm font-semibold text-white">{formatPriceEUR(tour.price)}</div>
                </div>

                <div className="mt-6 space-y-4">
                  <div className="text-xs font-semibold text-slate-200">Dati obbligatori</div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-200" htmlFor="qb-name">
                      Nome
                    </label>
                    <input
                      id="qb-name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      onBlur={() => markTouched('name')}
                      placeholder="Nome e cognome"
                      autoComplete="name"
                      className={[
                        'mt-2 w-full rounded-2xl border bg-slate-950/40 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-400 outline-none',
                        showError('name')
                          ? 'border-red-500/40 focus:border-red-500/70'
                          : 'border-white/10 focus:border-white/20',
                      ].join(' ')}
                    />
                    {showError('name') ? (
                      <div className="mt-2 text-xs text-red-200">{fieldErrors.name}</div>
                    ) : null}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-200" htmlFor="qb-email">
                      Email
                    </label>
                    <input
                      id="qb-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onBlur={() => markTouched('email')}
                      placeholder="Email"
                      autoComplete="email"
                      className={[
                        'mt-2 w-full rounded-2xl border bg-slate-950/40 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-400 outline-none',
                        showError('email')
                          ? 'border-red-500/40 focus:border-red-500/70'
                          : 'border-white/10 focus:border-white/20',
                      ].join(' ')}
                    />
                    {showError('email') ? (
                      <div className="mt-2 text-xs text-red-200">{fieldErrors.email}</div>
                    ) : null}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-200" htmlFor="qb-phone">
                      Telefono
                    </label>
                    <input
                      id="qb-phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      onBlur={() => markTouched('phone')}
                      placeholder="Telefono"
                      autoComplete="tel"
                      className={[
                        'mt-2 w-full rounded-2xl border bg-slate-950/40 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-400 outline-none',
                        showError('phone')
                          ? 'border-red-500/40 focus:border-red-500/70'
                          : 'border-white/10 focus:border-white/20',
                      ].join(' ')}
                    />
                    {showError('phone') ? (
                      <div className="mt-2 text-xs text-red-200">{fieldErrors.phone}</div>
                    ) : null}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-200" htmlFor="passengers-quick">
                      Partecipanti
                    </label>
                    <input
                      id="passengers-quick"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      value={passengers}
                      onChange={(e) =>
                        setPassengers(e.target.value === '' ? '' : Number(e.target.value))
                      }
                      onBlur={() => markTouched('passengers')}
                      className={[
                        'mt-2 w-full rounded-2xl border bg-slate-950/40 px-4 py-3 text-sm text-slate-100 outline-none',
                        showError('passengers')
                          ? 'border-red-500/40 focus:border-red-500/70'
                          : 'border-white/10 focus:border-white/20',
                      ].join(' ')}
                    />
                    {showError('passengers') ? (
                      <div className="mt-2 text-xs text-red-200">{fieldErrors.passengers}</div>
                    ) : null}
                  </div>
                  <div className="pt-2 text-xs font-semibold text-slate-200">Select date</div>
                  {instances.length === 0 ? (
                    <div className="mt-2 rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-slate-300">
                      Dates not available
                    </div>
                  ) : (
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {instances.map((inst) => {
                        const isSelected = selectedInstance?.id === inst.id
                        const available = Number(inst.available) || 0
                        const capacity = Number(inst.capacity) || 0
                        const booked = Number(inst.booked) || 0
                        const tone = instanceAvailabilityStyle(inst)
                        const statusLabel = instanceStatusLabel(inst)
                        return (
                          <div
                            key={inst.id}
                            className={[
                              'rounded-2xl border p-3 text-left text-sm transition',
                              tone.card,
                              isSelected ? 'ring-2 ring-blue-400/60' : '',
                            ].join(' ')}
                          >
                            <button
                              type="button"
                              disabled={available === 0}
                              onClick={() => setSelectedInstance(inst)}
                              className={[
                                'w-full rounded-xl px-2 py-2 text-left transition',
                                available === 0 ? 'cursor-not-allowed opacity-80' : 'hover:bg-white/5',
                              ].join(' ')}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="text-sm font-semibold text-white">{inst.date}</div>
                                {statusLabel ? (
                                  <span
                                    className={[
                                      'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                                      tone.labelBg,
                                    ].join(' ')}
                                  >
                                    {statusLabel}
                                  </span>
                                ) : null}
                              </div>
                              <ul className={`mt-2 space-y-1 text-xs ${tone.accent}`}>
                                <li>
                                  <span className="text-slate-400">Posti totali: </span>
                                  <span className="font-semibold text-white">{capacity}</span>
                                </li>
                                <li>
                                  <span className="text-slate-400">Prenotati: </span>
                                  <span className="font-semibold text-white">{booked}</span>
                                </li>
                                <li>
                                  <span className="text-slate-400">Disponibili: </span>
                                  <span className="font-semibold text-white">{available}</span>
                                </li>
                              </ul>
                            </button>
                            <button
                              type="button"
                              disabled={
                                available === 0 ||
                                !quickBookFieldsOk ||
                                !peopleOk ||
                                stripeCheckoutLoadingId !== null ||
                                reserveSubmitting ||
                                paySubmitting
                              }
                              onClick={() => handleCheckout(inst)}
                              className={[
                                'mt-3 w-full rounded-xl px-3 py-2.5 text-xs font-semibold leading-snug transition active:scale-[0.98]',
                                available === 0 || !quickBookFieldsOk || !peopleOk
                                  ? 'cursor-not-allowed bg-slate-700/50 text-slate-400'
                                  : 'bg-white text-slate-950 hover:bg-slate-100',
                              ].join(' ')}
                            >
                              {stripeCheckoutLoadingId === inst.id
                                ? 'Reindirizzamento…'
                                : 'Continue to Payment (Stripe)'}
                            </button>
                            <button
                              type="button"
                              disabled={
                                available === 0 ||
                                !quickBookFieldsOk ||
                                !peopleOk ||
                                stripeCheckoutLoadingId !== null ||
                                reserveSubmitting ||
                                paySubmitting
                              }
                              onClick={() => openReserveModal(inst)}
                              className={[
                                'mt-2 w-full rounded-xl px-3 py-2.5 text-xs font-semibold leading-snug transition active:scale-[0.98]',
                                available === 0 || !quickBookFieldsOk || !peopleOk
                                  ? 'cursor-not-allowed bg-emerald-900/30 text-slate-500'
                                  : 'bg-emerald-600 text-white hover:bg-emerald-500',
                              ].join(' ')}
                            >
                              {reserveSubmitting && reserveInstance?.id === inst.id
                                ? 'Prenotazione…'
                                : 'Prenota'}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {selectedInstance ? (
                    <div className="mt-4 space-y-3">
                      <button
                        type="button"
                        disabled={
                          (Number(selectedInstance.available) || 0) <= 0 ||
                          !quickBookFieldsOk ||
                          !peopleOk ||
                          reserveSubmitting ||
                          paySubmitting
                        }
                        onClick={() => openReserveModal(selectedInstance)}
                        className={[
                          'w-full rounded-2xl border px-4 py-3 text-sm font-semibold transition active:scale-[0.98]',
                          (Number(selectedInstance.available) || 0) <= 0 ||
                            !quickBookFieldsOk ||
                            !peopleOk
                            ? 'cursor-not-allowed border-white/10 bg-slate-800/40 text-slate-500'
                            : 'border-emerald-400/40 bg-emerald-600/20 text-emerald-100 hover:bg-emerald-600/30',
                        ].join(' ')}
                      >
                        Prenota
                      </button>
                      <button
                        type="button"
                        disabled={(Number(selectedInstance.available) || 0) <= 0}
                        onClick={() =>
                          navigate(`/booking?instance_id=${selectedInstance.id}`)
                        }
                        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-semibold text-slate-200 hover:bg-white/10"
                      >
                        Apri pagina prenotazione
                      </button>
                    <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-slate-200">
                      <div>
                        <span className="text-slate-400">Data selezionata:</span>{' '}
                        <span className="font-semibold text-white">{selectedInstance.date}</span>
                      </div>
                      <div className="mt-2 space-y-1 text-xs">
                        <div>
                          <span className="text-slate-400">Posti totali: </span>
                          <span className="font-semibold text-white">
                            {Number(selectedInstance.capacity) || 0}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400">Prenotati: </span>
                          <span className="font-semibold text-white">
                            {Number(selectedInstance.booked) || 0}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400">Disponibili: </span>
                          <span className="font-semibold text-white">
                            {Number(selectedInstance.available) || 0}
                          </span>
                        </div>
                      </div>
                    </div>
                    </div>
                  ) : null}

                  <p className="text-xs text-slate-400">
                    By continuing, you agree to our terms. You will be redirected to Stripe Checkout.
                  </p>
                </div>
              </div>
            </aside>
          </div>
        </main>
      )}

      <Dialog open={reserveOpen} onOpenChange={onReserveOpenChange}>
        <DialogContent className="max-w-md border-slate-700 bg-slate-950 text-slate-100 sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-slate-50">Prenotazione</DialogTitle>
          </DialogHeader>

          {reserveInstance ? (
            <div className="space-y-4 text-sm">
              {(() => {
                const availModal =
                  Number(reserveInstance.available ?? reserveInstance.available_seats) || 0
                const unit = Number(tour?.price) || 0
                const seatsN = Number(reserveSeats)
                const seatsSafe = Number.isFinite(seatsN) && seatsN >= 1 ? seatsN : 1
                const totalLive = unit * seatsSafe

                return reserveStep === 'form' ? (
                  <>
                    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">
                      <div>
                        <span className="text-slate-500">Data turno</span>{' '}
                        <span className="font-semibold text-white">{reserveInstance.date}</span>
                      </div>
                      <div className="mt-1">
                        <span className="text-slate-500">Posti disponibili</span>{' '}
                        <span className="font-semibold text-emerald-300">{availModal}</span>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-400" htmlFor="reserve-seats">
                        Numero posti
                      </label>
                      <Input
                        id="reserve-seats"
                        type="number"
                        min={1}
                        max={Math.max(1, availModal)}
                        className="mt-1 border-slate-600 bg-slate-900 text-slate-100"
                        value={reserveSeats}
                        onChange={(e) =>
                          setReserveSeats(e.target.value === '' ? '' : Number(e.target.value))
                        }
                      />
                    </div>
                    <div className="rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2">
                      <div className="text-xs text-slate-400">Prezzo totale (stimato)</div>
                      <div className="text-lg font-semibold text-white">{formatPriceEUR(totalLive)}</div>
                      <div className="text-[11px] text-slate-500">
                        {formatPriceEUR(unit)} × {seatsSafe} posti
                      </div>
                    </div>
                    {reserveError ? (
                      <div className="rounded-lg border border-red-500/40 bg-red-950/50 px-3 py-2 text-xs text-red-200">
                        {reserveError}
                      </div>
                    ) : null}
                    <DialogFooter className="gap-2 sm:gap-0">
                      <Button type="button" variant="outline" onClick={closeReserve}>
                        Annulla
                      </Button>
                      <Button type="button" onClick={handleReserveSubmit} disabled={reserveSubmitting}>
                        {reserveSubmitting ? 'Invio…' : 'Conferma prenotazione'}
                      </Button>
                    </DialogFooter>
                  </>
                ) : reserveStep === 'summary' ? (
                  <>
                    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-xs text-slate-300">
                      <div className="text-sm font-semibold text-white">Riepilogo</div>
                      <div className="mt-2 space-y-1">
                        <div>
                          Prenotazione #{reserveResult?.id ?? '—'} · stato{' '}
                          <span className="text-amber-200">{reserveResult?.status ?? '—'}</span>
                        </div>
                        <div>
                          Posti:{' '}
                          <span className="font-medium text-white">
                            {reserveResult?.seats_booked ?? reserveResult?.people ?? '—'}
                          </span>
                        </div>
                        <div>
                          Totale:{' '}
                          <span className="font-medium text-white">
                            {formatPriceEUR(
                              typeof reserveResult?.total_price === 'number'
                                ? reserveResult.total_price
                                : Number(reserveResult?.price) || 0,
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                    {reserveError ? (
                      <div className="rounded-lg border border-red-500/40 bg-red-950/50 px-3 py-2 text-xs text-red-200">
                        {reserveError}
                      </div>
                    ) : null}
                    <DialogFooter className="flex-col gap-2 sm:flex-row">
                      <Button type="button" variant="outline" onClick={closeReserve}>
                        Chiudi
                      </Button>
                      <Button type="button" onClick={handlePaySimulated} disabled={paySubmitting}>
                        {paySubmitting ? 'Pagamento…' : 'Paga ora'}
                      </Button>
                    </DialogFooter>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-emerald-200">Pagamento registrato. Grazie!</p>
                    <DialogFooter>
                      <Button type="button" onClick={closeReserve}>
                        Chiudi
                      </Button>
                    </DialogFooter>
                  </>
                )
              })()}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
