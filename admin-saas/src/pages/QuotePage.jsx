import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'

import { api } from '../lib/api.js'
import { checkoutSessionErrorMessage } from '../lib/checkoutError.js'
import { Button } from '../components/ui/button.jsx'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.jsx'
import { Input } from '../components/ui/input.jsx'
import { PlacesAddressField } from '../components/PlacesAddressField.jsx'

function Field({ label, children }) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      {children}
    </div>
  )
}

export function QuotePage() {
  const { id } = useParams()
  const quoteId = useMemo(() => (id ? String(id) : ''), [id])
  const isValidId = useMemo(() => {
    if (!quoteId) return false
    if (quoteId === ':id') return false
    return /^\d+$/.test(quoteId)
  }, [quoteId])

  const [loading, setLoading] = useState(false)
  const [quote, setQuote] = useState(null)
  const [error, setError] = useState('')

  const [booking, setBooking] = useState(null)
  const [bookingError, setBookingError] = useState('')
  const [bookingLoading, setBookingLoading] = useState(false)

  const [loadingFlight, setLoadingFlight] = useState(false)
  const [flightMessage, setFlightMessage] = useState('')

  const [form, setForm] = useState({
    pickup: '',
    destination: '',
    flight_number: '',
    date: '',
    time: '',
    passenger_name: '',
    phone: '',
    people: '1',
  })

  /** Resolved via Nominatim (backend proxy); lat/lng for driver/nav. */
  const [resolvedPlaces, setResolvedPlaces] = useState({
    pickup: null,
    destination: null,
  })

  function formatTimeFromIso(isoString) {
    if (!isoString) return ''
    const d = new Date(isoString)
    if (Number.isNaN(d.getTime())) return ''
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    return `${hh}:${mm}`
  }

  const fetchFlight = async () => {
    const normalized = String(form.flight_number || '').trim()
    if (!normalized) return

    setLoadingFlight(true)
    setFlightMessage('')
    try {
      const res = await api.post('/api/flights/lookup', {
        flight_number: normalized,
      })
      const data = res?.data

      if (data) {
        setResolvedPlaces((rp) => ({ ...rp, pickup: null }))
        setForm((f) => ({
          ...f,
          pickup: data?.arrival || f.pickup,
          time: formatTimeFromIso(data?.estimated_arrival || data?.scheduled_arrival) || f.time,
        }))
        setFlightMessage('Flight found. Pickup/time updated.')
      } else {
        setFlightMessage('Flight not found.')
      }
    } catch (err) {
      const status = err?.response?.status
      if (status === 404) {
        setFlightMessage('Flight not found. Check format or try without spaces (e.g. FR1028)')
      } else setFlightMessage('Flight lookup failed. Try again.')
      console.error('Flight lookup failed', err)
    } finally {
      setLoadingFlight(false)
    }
  }

  async function load() {
    if (!isValidId) return
    setLoading(true)
    setError('')
    try {
      const { data } = await api.get(`/api/quotes/${quoteId}`)
      setQuote(data)
      const statusLower = String(data?.status || '').toLowerCase()
      const bookingId = data?.booking_id
      if (statusLower === 'confirmed' && bookingId != null) {
        setBookingLoading(true)
        setBookingError('')
        try {
          const resBooking = await api.get(`/api/bookings/${bookingId}`)
          setBooking(resBooking?.data ?? null)
        } catch (e) {
          setBooking(null)
          setBookingError(e?.response?.data?.detail ?? e?.message ?? 'Impossibile caricare la prenotazione')
        } finally {
          setBookingLoading(false)
        }
      } else {
        setBooking(null)
        setBookingError('')
        setBookingLoading(false)
      }
      setForm({
        pickup: data?.pickup ?? '',
        destination: data?.destination ?? '',
        flight_number: data?.flight_number ?? '',
        date: data?.date ?? '',
        time: String(data?.time ?? '').slice(0, 5),
        passenger_name: data?.customer_name ?? '',
        phone: data?.phone ?? '',
        people: String(data?.people ?? 1),
      })
      setResolvedPlaces({ pickup: null, destination: null })
    } catch (e) {
      setError(e?.response?.data?.detail ?? e?.message ?? 'Failed to load quote')
      setQuote(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!isValidId) {
      setQuote(null)
      setError('Link preventivo non valido')
      return
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteId, isValidId])

  async function onPay(e) {
    e.preventDefault()
    if (!quoteId || !quote) return
    if (String(quote.status || '').toLowerCase() !== 'pending') return
    setLoading(true)
    setError('')
    try {
      const people = Number(form.people)
      if (!Number.isFinite(people) || people < 1) throw new Error('Passengers must be >= 1')

      await api.patch(`/api/quotes/${quoteId}`, {
        pickup: form.pickup,
        destination: form.destination,
        flight_number: form.flight_number,
        date: form.date,
        time: form.time ? `${form.time}:00` : null,
        passenger_name: form.passenger_name,
        phone: form.phone,
        people,
      })

      const res = await api.post('/api/payments/create-checkout-session', {
        quote_id: Number(quoteId),
      })
      const url = res?.data?.url ?? res?.data?.checkout_url
      if (!url) throw new Error('Missing payment URL')
      window.location.href = url
    } catch (e2) {
      setError(checkoutSessionErrorMessage(e2))
    } finally {
      setLoading(false)
    }
  }

  const statusLower = String(quote?.status || '').toLowerCase()
  const isPending = statusLower === 'pending'
  const isConfirmed = statusLower === 'confirmed'
  const isCancelled = statusLower === 'cancelled'

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-100">
      <main className="mx-auto max-w-xl px-4 py-10 sm:px-6">
        <div className="mb-6">
          <div className="text-2xl font-semibold tracking-tight">Preventivo transfer</div>
          <div className="mt-1 text-sm text-slate-300">Controlla i dati e paga per confermare la corsa.</div>
          {quote ? (
            <div className="mt-3 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-100">
              {statusLower === 'pending' && 'In attesa di pagamento'}
              {statusLower === 'confirmed' && 'Pagamento completato'}
              {statusLower === 'cancelled' && 'Prenotazione annullata'}
              {!['pending', 'confirmed', 'cancelled'].includes(statusLower) && `Stato: ${statusLower}`}
            </div>
          ) : null}
        </div>

        <Card className="border border-white/10 bg-white/5 text-slate-100 shadow-sm">
          <CardHeader className="p-5">
            <CardTitle className="text-base">Dettaglio</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 p-5 pt-0">
            {error ? (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            ) : null}

            {!quote && !error ? (
              <div className="text-sm text-slate-300">{loading ? 'Caricamento…' : '—'}</div>
            ) : null}

            {!loading && !quote ? (
              <div className="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-6 text-sm text-slate-300">
                Preventivo non trovato o non più valido
              </div>
            ) : null}

            {quote && isConfirmed ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                  Pagamento completato
                  {quote.booking_id != null ? ` (prenotazione #${quote.booking_id})` : ''}.<br />
                  Riceverai una email di conferma con tutti i dettagli del viaggio.
                </div>
                {bookingError ? (
                  <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 px-4 py-3 text-xs text-yellow-100">
                    {bookingError}
                  </div>
                ) : null}
                {bookingLoading ? (
                  <div className="text-sm text-slate-300">Caricamento dettagli prenotazione…</div>
                ) : null}
                {booking && booking.qr_code ? (
                  <div className="space-y-2">
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
                      QR check-in
                    </div>
                    <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
                      <img
                        src={booking.qr_code}
                        alt={`QR prenotazione #${booking.id}`}
                        className="mx-auto h-40 w-40 rounded-lg bg-white p-2"
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {quote && isCancelled ? (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                Prenotazione annullata. Nessun pagamento è dovuto per questo preventivo.
              </div>
            ) : null}

            {quote && isPending ? (
              <form className="space-y-5" onSubmit={onPay}>
                <div className="grid gap-4">
                  <Field label="Pickup">
                    <PlacesAddressField
                      value={form.pickup}
                      onChange={(v) => setForm((f) => ({ ...f, pickup: v }))}
                      onPlaceResolved={(p) =>
                        setResolvedPlaces((rp) => ({ ...rp, pickup: p }))
                      }
                      required
                      inputClassName="bg-slate-950/40 text-slate-100"
                    />
                  </Field>
                  <Field label="Destination">
                    <PlacesAddressField
                      value={form.destination}
                      onChange={(v) => setForm((f) => ({ ...f, destination: v }))}
                      onPlaceResolved={(p) =>
                        setResolvedPlaces((rp) => ({ ...rp, destination: p }))
                      }
                      required
                      inputClassName="bg-slate-950/40 text-slate-100"
                    />
                  </Field>
                  {import.meta.env.DEV &&
                  (resolvedPlaces.pickup?.lat != null ||
                    resolvedPlaces.destination?.lat != null) ? (
                    <div className="rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2 text-[11px] text-slate-400">
                      <div className="font-medium text-slate-300">Maps (dev)</div>
                      {resolvedPlaces.pickup?.lat != null ? (
                        <div>
                          Pickup: {resolvedPlaces.pickup.lat}, {resolvedPlaces.pickup.lng}
                        </div>
                      ) : null}
                      {resolvedPlaces.destination?.lat != null ? (
                        <div>
                          Dest: {resolvedPlaces.destination.lat},{' '}
                          {resolvedPlaces.destination.lng}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <Field label="Flight number">
                    <div className="grid gap-2">
                      <Input
                        value={form.flight_number}
                        onChange={(e) => {
                          const cleaned = String(e.target.value || '')
                            .toUpperCase()
                            .replaceAll(' ', '')
                          setForm((f) => ({ ...f, flight_number: cleaned }))
                        }}
                        placeholder="Flight number"
                        className="bg-slate-950/40 text-slate-100"
                      />
                      <div className="text-xs text-slate-400">Example: AZ1783</div>
                      <div className="flex items-center gap-3">
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={fetchFlight}
                          disabled={loadingFlight || !String(form.flight_number || '').trim()}
                        >
                          {loadingFlight ? 'Fetching…' : 'Fetch flight'}
                        </Button>
                        {flightMessage ? (
                          <div className="text-xs text-slate-300">{flightMessage}</div>
                        ) : null}
                      </div>
                    </div>
                  </Field>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Date">
                    <Input
                      type="date"
                      value={form.date}
                      onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                      required
                      className="bg-slate-950/40 text-slate-100"
                    />
                  </Field>
                  <Field label="Time">
                    <Input
                      type="time"
                      value={form.time}
                      onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                      required
                      className="bg-slate-950/40 text-slate-100"
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Passenger name">
                    <Input
                      value={form.passenger_name}
                      onChange={(e) => setForm((f) => ({ ...f, passenger_name: e.target.value }))}
                      required
                      className="bg-slate-950/40 text-slate-100"
                      autoComplete="name"
                    />
                  </Field>
                  <Field label="Phone">
                    <Input
                      type="tel"
                      value={form.phone}
                      onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                      required
                      className="bg-slate-950/40 text-slate-100"
                      autoComplete="tel"
                    />
                  </Field>
                </div>

                <Field label="Passengers">
                  <Input
                    type="number"
                    min={1}
                    value={form.people}
                    onChange={(e) => setForm((f) => ({ ...f, people: e.target.value }))}
                    required
                    className="bg-slate-950/40 text-slate-100"
                  />
                </Field>

                <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm">
                  <div className="text-slate-300">Prezzo</div>
                  <div className="text-lg font-semibold">€ {Number(quote.price).toFixed(2)}</div>
                </div>

                <Button type="submit" disabled={loading} className="w-full">
                  {loading ? 'Reindirizzamento…' : 'Paga ora'}
                </Button>
              </form>
            ) : null}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
