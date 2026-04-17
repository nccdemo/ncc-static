import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

import { api } from '../lib/api.js'
import { checkoutSessionErrorMessage } from '../lib/checkoutError.js'
import { getStoredReferralCode, persistReferralFromUrlSearch } from '../lib/referralStorage.js'

function formatPriceEUR(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  return `${value}€`
}

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

export default function PublicBooking() {
  const location = useLocation()
  const params = new URLSearchParams(location.search)
  const instanceIdRaw = params.get('instance_id')
  const instanceId = instanceIdRaw ? Number(instanceIdRaw) : NaN
  const instanceIdOk = Number.isFinite(instanceId) && instanceId > 0

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [instanceRow, setInstanceRow] = useState(null)
  const [tour, setTour] = useState(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [passengers, setPassengers] = useState(1)
  const [touched, setTouched] = useState({})
  const [stripeLoading, setStripeLoading] = useState(false)

  useEffect(() => {
    if (!instanceIdOk) {
      setLoading(false)
      return
    }
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const instRes = await api.get(`/api/tour-instances/${instanceId}`)
        if (cancelled) return
        const tourId = instRes.data?.tour_id
        if (tourId == null) {
          setError('Invalid instance data')
          setInstanceRow(null)
          setTour(null)
          return
        }
        const [tourRes, listRes] = await Promise.all([
          api.get(`/api/tours/${tourId}`),
          api.get(`/api/tours/${tourId}/instances`),
        ])
        if (cancelled) return
        setTour(tourRes.data ?? null)
        const list = Array.isArray(listRes.data) ? listRes.data : []
        const row = list.find((r) => Number(r.id) === instanceId)
        setInstanceRow(
          row ?? {
            id: instanceId,
            date: instRes.data.date,
            capacity: instRes.data.capacity ?? 0,
            booked: 0,
            available: Math.max(0, Number(instRes.data.capacity) || 0),
          },
        )
      } catch (e) {
        if (cancelled) return
        setError(e?.response?.data?.detail ?? e?.message ?? 'Failed to load booking data')
        setInstanceRow(null)
        setTour(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [instanceId, instanceIdOk])

  const fieldErrors = useMemo(
    () => validateContactAndPeople({ name, email, phone, passengers }),
    [name, email, phone, passengers],
  )

  function markTouched(key) {
    setTouched((prev) => ({ ...prev, [key]: true }))
  }

  const showError = (key) => Boolean(fieldErrors[key] && touched[key])

  async function handleCheckout() {
    const available = Number(instanceRow?.available) || 0
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

    setStripeLoading(true)
    try {
      persistReferralFromUrlSearch(typeof window !== 'undefined' ? window.location.search : '')
      const referral_code = getStoredReferralCode() ?? null

      const res = await api.post(`/api/payments/create-checkout`, {
        tour_instance_id: instanceId,
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
      setStripeLoading(false)
    }
  }

  if (!instanceIdRaw || !instanceIdOk) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-100">
        <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/70 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
            <Link to="/public/tours" className="text-sm font-semibold tracking-tight hover:text-white">
              NCC Demo
            </Link>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
            <div className="text-lg font-semibold">Missing booking data</div>
            <p className="mt-2 text-sm text-slate-300">
              Scegli un tour e una data, poi apri la pagina di prenotazione da lì.
            </p>
            <Link
              to="/public/tours"
              className="mt-6 inline-flex rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-slate-100"
            >
              Torna ai tour
            </Link>
          </div>
        </main>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-100">
        <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/70 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
            <Link to="/public/tours" className="text-sm font-semibold tracking-tight hover:text-white">
              NCC Demo
            </Link>
            <div className="text-xs text-slate-300">Prenotazione</div>
          </div>
        </header>
        <div className="mx-auto max-w-6xl px-4 py-16 text-center text-sm text-slate-300">Loading…</div>
      </div>
    )
  }

  if (error || !instanceRow || !tour) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-100">
        <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/70 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
            <Link to="/public/tours" className="text-sm font-semibold tracking-tight hover:text-white">
              NCC Demo
            </Link>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <div className="rounded-3xl border border-red-500/20 bg-red-500/10 p-6 text-sm text-red-200">
            {error ?? 'Impossibile caricare la prenotazione.'}
          </div>
          <Link
            to="/public/tours"
            className="mt-6 inline-flex rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-100 hover:bg-white/10"
          >
            Torna ai tour
          </Link>
        </main>
      </div>
    )
  }

  const available = Number(instanceRow.available) || 0

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-100">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Link to="/public/tours" className="text-sm font-semibold tracking-tight hover:text-white">
            NCC Demo
          </Link>
          <div className="text-xs sm:text-sm text-slate-300">Prenotazione</div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-12">
          <section className="lg:col-span-7">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-8">
              <h1 className="text-2xl font-semibold tracking-tight">{tour.title ?? 'Tour'}</h1>
              {tour.description ? (
                <p className="mt-2 text-sm text-slate-300">{tour.description}</p>
              ) : null}
              <div className="mt-6 rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm">
                <div>
                  <span className="text-slate-400">Data: </span>
                  <span className="font-semibold text-white">{instanceRow.date}</span>
                </div>
                <div className="mt-2 text-xs text-slate-300">
                  Posti disponibili: <span className="font-semibold text-white">{available}</span>
                </div>
                <div className="mt-1 text-xs text-slate-300">
                  Prezzo unitario: <span className="font-semibold text-white">{formatPriceEUR(tour.price)}</span>
                </div>
              </div>
            </div>
          </section>
          <aside className="lg:col-span-5">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-sm sm:p-8">
              <div className="text-sm font-semibold">I tuoi dati</div>
              <div className="mt-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-200" htmlFor="bk-name">
                    Nome
                  </label>
                  <input
                    id="bk-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={() => markTouched('name')}
                    className={[
                      'mt-2 w-full rounded-2xl border bg-slate-950/40 px-4 py-3 text-sm text-slate-100 outline-none',
                      showError('name') ? 'border-red-500/40' : 'border-white/10',
                    ].join(' ')}
                  />
                  {showError('name') ? (
                    <div className="mt-1 text-xs text-red-200">{fieldErrors.name}</div>
                  ) : null}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-200" htmlFor="bk-email">
                    Email
                  </label>
                  <input
                    id="bk-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onBlur={() => markTouched('email')}
                    className={[
                      'mt-2 w-full rounded-2xl border bg-slate-950/40 px-4 py-3 text-sm text-slate-100 outline-none',
                      showError('email') ? 'border-red-500/40' : 'border-white/10',
                    ].join(' ')}
                  />
                  {showError('email') ? (
                    <div className="mt-1 text-xs text-red-200">{fieldErrors.email}</div>
                  ) : null}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-200" htmlFor="bk-phone">
                    Telefono
                  </label>
                  <input
                    id="bk-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    onBlur={() => markTouched('phone')}
                    className={[
                      'mt-2 w-full rounded-2xl border bg-slate-950/40 px-4 py-3 text-sm text-slate-100 outline-none',
                      showError('phone') ? 'border-red-500/40' : 'border-white/10',
                    ].join(' ')}
                  />
                  {showError('phone') ? (
                    <div className="mt-1 text-xs text-red-200">{fieldErrors.phone}</div>
                  ) : null}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-200" htmlFor="bk-passengers">
                    Partecipanti
                  </label>
                  <input
                    id="bk-passengers"
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
                      showError('passengers') ? 'border-red-500/40' : 'border-white/10',
                    ].join(' ')}
                  />
                  {showError('passengers') ? (
                    <div className="mt-1 text-xs text-red-200">{fieldErrors.passengers}</div>
                  ) : null}
                </div>
                <button
                  type="button"
                  disabled={available <= 0 || stripeLoading}
                  onClick={handleCheckout}
                  className={[
                    'mt-2 w-full rounded-2xl px-4 py-3 text-sm font-semibold transition active:scale-[0.98]',
                    available <= 0 || stripeLoading
                      ? 'cursor-not-allowed bg-slate-700/50 text-slate-400'
                      : 'bg-white text-slate-950 hover:bg-slate-100',
                  ].join(' ')}
                >
                  {stripeLoading ? 'Reindirizzamento…' : 'Continue to Payment'}
                </button>
                {available <= 0 ? (
                  <p className="text-xs text-red-200">Nessun posto disponibile per questa data.</p>
                ) : null}
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  )
}
