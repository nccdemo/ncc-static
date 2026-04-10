import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '../api/axios.js'
import { formatApiDetail } from '../api/client.js'
import { CardElement, Elements, useElements, useStripe } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'

function hhmm(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function toNumberOrNull(v) {
  if (v === '' || v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function formatTripEUR(v) {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n) || n < 0) return null
  return `€${n.toFixed(2)}`
}

if (!import.meta.env.VITE_STRIPE_PUBLIC_KEY) {
  console.error('Missing Stripe public key')
}
const stripePromise = import.meta.env.VITE_STRIPE_PUBLIC_KEY
  ? loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY)
  : null

function normalizeDriverTripStatus(raw) {
  const s = String(raw || '')
    .toLowerCase()
    .replace(/-/g, '_')
  if (s === 'in_progress') return 'on_trip'
  return s
}

function TripPaymentPanel({ tripId, disabled, onCash, onPaid }) {
  const stripe = useStripe()
  const elements = useElements()
  const [paying, setPaying] = useState(false)
  const [cardErr, setCardErr] = useState('')

  const handleCardPayment = useCallback(async () => {
    try {
      if (!stripe || !elements) return
      const cardElement = elements.getElement(CardElement)
      if (!cardElement) return

      setPaying(true)
      setCardErr('')
      const res = await fetch(`/api/rides/${tripId}/create-payment-intent`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(
          typeof data?.detail === 'string' ? data.detail : 'Could not create payment intent',
        )
      }

      const result = await stripe.confirmCardPayment(data.client_secret, {
        payment_method: {
          card: cardElement,
        },
      })

      if (result.error) {
        throw new Error(result.error.message || 'Payment failed')
      }

      if (result.paymentIntent?.status === 'succeeded') {
        const pid = result.paymentIntent.id
        const cr = await fetch(`/api/rides/${tripId}/confirm-stripe-payment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payment_intent_id: pid }),
        })
        const cd = await cr.json().catch(() => ({}))
        if (!cr.ok) {
          const msg =
            typeof cd?.detail === 'string' ? cd.detail : 'Registrazione pagamento fallita'
          console.error('confirm-stripe-payment:', msg)
          setCardErr(msg)
          alert(
            `Pagamento Stripe riuscito ma aggiornamento sistema non riuscito: ${msg}. Controlla la dashboard o riprova.`,
          )
        } else {
          alert('Payment successful')
        }
        await onPaid?.()
        return
      }

      throw new Error(`Unexpected status: ${result.paymentIntent?.status || 'unknown'}`)
    } catch (err) {
      console.error(err)
      setCardErr(err?.message || 'Payment failed')
      alert('Payment failed')
    } finally {
      setPaying(false)
    }
  }, [elements, onPaid, stripe, tripId])

  return (
    <>
      <div className="field" style={{ marginTop: '0.5rem' }}>
        <label className="field-label">Card</label>
        <div className="input" style={{ padding: '10px 12px' }}>
          <CardElement options={{ hidePostalCode: true }} />
        </div>
      </div>
      {cardErr ? <p className="banner error">{cardErr}</p> : null}
      <div className="service-actions" style={{ marginTop: '0.75rem' }}>
        <button type="button" className="btn btn-outline btn-block" disabled={disabled} onClick={onCash}>
          Pay Cash
        </button>
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={disabled || paying || !stripe || !elements}
          onClick={handleCardPayment}
        >
          {paying ? 'Processing…' : 'Pay with Card'}
        </button>
      </div>
    </>
  )
}

export default function ServiceSheet({ tripId, driverId, onBack, onOpenScan }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tripMeta, setTripMeta] = useState(null)
  const [saving, setSaving] = useState(false)
  const [serviceError, setServiceError] = useState('')
  const [startKm, setStartKm] = useState('')
  const [endKm, setEndKm] = useState('')
  const [startKmDirty, setStartKmDirty] = useState(false)
  const [endKmDirty, setEndKmDirty] = useState(false)
  const [showResetModal, setShowResetModal] = useState(false)
  const [ridePayment, setRidePayment] = useState({
    settled: false,
    label: null,
    status: 'none',
  })

  const completed = Boolean(tripMeta?.service_end_time)
  const started = Boolean(tripMeta?.service_start_time)
  const canReset = Boolean(tripMeta?.service_start_time || tripMeta?.service_end_time)
  const statusUpper = String(tripMeta?.status || '').toUpperCase()
  const showPickupNav = statusUpper !== 'IN_PROGRESS'
  const showDestinationNav = statusUpper === 'IN_PROGRESS'
  const tripNorm = normalizeDriverTripStatus(tripMeta?.status)
  const canTakePayment = tripNorm === 'arrived' || tripNorm === 'on_trip'

  const refreshRidePayment = useCallback(async () => {
    try {
      const { data } = await api.get(`/rides/${tripId}/payment-status`)
      setRidePayment({
        settled: Boolean(data?.settled),
        label: data?.label ?? null,
        status: data?.status ?? 'none',
      })
    } catch (e) {
      console.error(e)
      setRidePayment({ settled: false, label: null, status: 'none' })
    }
  }, [tripId])

  const handleCashPayment = useCallback(async () => {
    try {
      const res = await fetch(`/api/rides/${tripId}/cash`, {
        method: 'POST',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const detail = data?.detail
        const msg =
          typeof detail === 'string'
            ? detail
            : Array.isArray(detail) && detail[0]?.msg
              ? String(detail[0].msg)
              : res.statusText
        throw new Error(msg || 'Request failed')
      }
      alert('Cash payment recorded')
      await refreshRidePayment()
    } catch (err) {
      console.error(err)
      alert('Error recording cash payment')
    }
  }, [tripId, refreshRidePayment])

  const pickupLat = Number(tripMeta?.pickup_lat)
  const pickupLng = Number(tripMeta?.pickup_lng)
  const pickupCoordsOk = !Number.isNaN(pickupLat) && !Number.isNaN(pickupLng)

  // Prefer dropoff_* (new canonical naming for driver navigation), fallback to destination_*.
  const dropoffLat = Number(tripMeta?.dropoff_lat ?? tripMeta?.destination_lat)
  const dropoffLng = Number(tripMeta?.dropoff_lng ?? tripMeta?.destination_lng)
  const canNavigate = !Number.isNaN(dropoffLat) && !Number.isNaN(dropoffLng)

  const fetchTrip = useCallback(
    async (silent) => {
      if (!silent) setServiceError('')
      try {
        const res = await api.get(`/driver/trips/${tripId}`, { params: { driver_id: driverId } })
        const trip = res.data
        setTripMeta(trip)
        if (trip) {
          if (!startKmDirty) setStartKm(trip.start_km != null ? String(trip.start_km) : '')
          if (!endKmDirty) setEndKm(trip.end_km != null ? String(trip.end_km) : '')
        }
        await refreshRidePayment()
      } catch (e) {
        if (!silent) {
          setServiceError(formatApiDetail(e.response?.data?.detail) || 'Impossibile caricare i dati del viaggio')
        }
      }
    },
    [driverId, endKmDirty, refreshRidePayment, startKmDirty, tripId],
  )

  useEffect(() => {
    const effectiveDriverId = tripMeta?.driver_id ?? driverId
    if (!effectiveDriverId) return

    if (!navigator.geolocation) {
      setServiceError('Geolocalizzazione non supportata su questo dispositivo')
      return
    }

    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        const lat = position.coords.latitude
        const lng = position.coords.longitude

        console.log('GPS:', lat, lng)

        try {
          console.log('SENDING GPS TO BACKEND')
          // api baseURL is '/api' -> this becomes POST /api/drivers/location
          const res = await api.post('/drivers/location', {
            driver_id: Number(effectiveDriverId),
            lat,
            lng,
          })
          console.log('GPS RESPONSE:', res)
        } catch (err) {
          console.error('GPS SEND ERROR:', err)
          throw err
        }
      },
      (error) => {
        console.error('GPS error:', error)
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 5000,
      },
    )

    return () => {
      navigator.geolocation.clearWatch(watchId)
    }
  }, [driverId, tripMeta?.driver_id])

  useEffect(() => {
    let cancelled = false

    async function load(silent) {
      if (!silent) {
        setLoading(true)
        setError('')
      }
      try {
        const { data: body } = await api.get(`/trips/${tripId}/service-sheet`)
        if (!cancelled) {
          setData(body)
          if (!silent) setError('')
        }
      } catch (e) {
        console.error(e)
        if (!cancelled && !silent) {
          setError(formatApiDetail(e.response?.data?.detail) || 'Impossibile caricare il foglio')
        }
      } finally {
        if (!cancelled && !silent) setLoading(false)
      }
    }

    load(false)
    fetchTrip(false)
    const id = setInterval(() => {
      load(true)
      fetchTrip(true)
    }, 5000)

    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [tripId, fetchTrip])

  const routeLine = useMemo(() => {
    if (!tripMeta) return null
    const pickup = tripMeta.pickup || '—'
    const destination = tripMeta.destination || '—'
    return `${pickup} → ${destination}`
  }, [tripMeta])

  const updateService = useCallback(
    async (payload) => {
      setSaving(true)
      setServiceError('')
      try {
        console.log('Sending:', payload)
        const { data: res } = await api.post(`/driver/trips/${tripId}/update-service`, {
          driver_id: driverId,
          ...payload,
        })
        console.log('Update-service response:', res)

        // Force UI update immediately (do not rely on fetch/polling).
        // Prefer the exact timestamps we just sent, so the UI updates deterministically.
        setTripMeta((prev) => ({
          ...(prev || {}),
          id: tripId,
          start_km: res?.start_km ?? null,
          end_km: res?.end_km ?? null,
          service_start_time:
            payload?.service_start_time ?? res?.service_start_time ?? prev?.service_start_time ?? null,
          service_end_time:
            payload?.service_end_time ?? res?.service_end_time ?? prev?.service_end_time ?? null,
        }))

        // Keep inputs in sync after save
        if (Object.prototype.hasOwnProperty.call(payload, 'start_km')) {
          setStartKm(res?.start_km != null ? String(res.start_km) : '')
          setStartKmDirty(false)
        }
        if (Object.prototype.hasOwnProperty.call(payload, 'end_km')) {
          setEndKm(res?.end_km != null ? String(res.end_km) : '')
          setEndKmDirty(false)
        }
      } catch (e) {
        setServiceError(formatApiDetail(e.response?.data?.detail) || 'Aggiornamento non riuscito')
      } finally {
        setSaving(false)
      }
    },
    [driverId, tripId],
  )

  const handleResetService = useCallback(async () => {
    if (!tripId) return
    setSaving(true)
    setServiceError('')
    try {
      const { data: res } = await api.post(`/dispatch/trips/${tripId}/reset-service`)
      console.log('RESET RESPONSE:', res)
      setTripMeta((prev) => ({
        ...(prev || {}),
        id: tripId,
        service_start_time: null,
        service_end_time: null,
        start_km: null,
        end_km: null,
      }))
      setStartKm('')
      setEndKm('')
      setStartKmDirty(false)
      setEndKmDirty(false)
    } catch (e) {
      setServiceError(formatApiDetail(e.response?.data?.detail) || 'Reset non riuscito')
    } finally {
      setSaving(false)
      setShowResetModal(false)
    }
  }, [tripId])

  return (
    <div className="screen">
      <div className="toolbar">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          ← Back
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={onOpenScan}>
          Scan QR
        </button>
      </div>

      <h1 className="sheet-title">Foglio di servizio</h1>
      <p className="muted sheet-sub">Trip #{tripId}</p>
      {routeLine ? <p className="sheet-route">{routeLine}</p> : null}

      {!loading && !error && tripMeta && tripMeta.trip_price != null && Number(tripMeta.trip_price) > 0 ? (
        <section className="panel" style={{ marginTop: '0.75rem' }}>
          <h2>Tariffa corsa</h2>
          <div className="service-grid">
            <div className="service-box">
              <div className="service-label">Trip</div>
              <div className="service-value">{formatTripEUR(tripMeta.trip_price)}</div>
            </div>
            <div className="service-box">
              <div className="service-label">Your earnings</div>
              <div className="service-value">{formatTripEUR(tripMeta.driver_earnings) || '—'}</div>
            </div>
            <div className="service-box">
              <div className="service-label">Platform fee</div>
              <div className="service-value">{formatTripEUR(tripMeta.platform_fee) || '—'}</div>
            </div>
          </div>
          {typeof tripMeta.commission_rate === 'number' ? (
            <p className="muted-sm" style={{ marginTop: '0.5rem' }}>
              Fee rate: {(Number(tripMeta.commission_rate) * 100).toFixed(0)}%
            </p>
          ) : null}
        </section>
      ) : null}

      {!loading && !error && tripMeta ? (
        <div className="service-actions" style={{ marginTop: '0.75rem', marginBottom: '0.75rem' }}>
          {showPickupNav ? (
            <button
              type="button"
              className="btn btn-primary btn-block btn-big"
              title="Apri Google Maps — destinazione: pickup"
              disabled={!pickupCoordsOk}
              onClick={() => {
                if (pickupCoordsOk) {
                  window.open(
                    `https://www.google.com/maps/dir/?api=1&destination=${pickupLat},${pickupLng}`,
                    '_blank',
                  )
                }
              }}
            >
              Naviga
            </button>
          ) : null}

          {showDestinationNav ? (
            <button
              type="button"
              className="btn btn-primary btn-block btn-big"
              title="Apri Google Maps — destinazione finale"
              disabled={!canNavigate}
              onClick={() => {
                if (canNavigate) {
                  window.open(
                    `https://www.google.com/maps/dir/?api=1&destination=${dropoffLat},${dropoffLng}`,
                    '_blank',
                  )
                }
              }}
            >
              Naviga
            </button>
          ) : null}
        </div>
      ) : null}

      <a
        className="btn btn-outline"
        href={`/api/service-sheet/${tripId}/pdf`}
        target="_blank"
        rel="noopener noreferrer"
      >
        📄 Apri PDF
      </a>

      {loading && <p className="muted center-pad">Loading…</p>}
      {error && <p className="banner error">{error}</p>}
      {serviceError && <p className="banner error">{serviceError}</p>}

      {!loading && !error && data && (
        <>
          {canTakePayment ? (
            <section className="panel" style={{ marginTop: '0.75rem' }}>
              <h2>Payment</h2>
              {ridePayment.settled ? (
                <p className="muted" style={{ marginTop: '0.5rem', fontWeight: 600 }}>
                  {ridePayment.label}
                </p>
              ) : stripePromise ? (
                <Elements stripe={stripePromise}>
                  <TripPaymentPanel
                    tripId={tripId}
                    disabled={saving}
                    onCash={handleCashPayment}
                    onPaid={refreshRidePayment}
                  />
                </Elements>
              ) : (
                <>
                  <div className="service-actions" style={{ marginTop: '0.75rem' }}>
                    <button
                      type="button"
                      className="btn btn-outline btn-block"
                      disabled={saving}
                      onClick={handleCashPayment}
                    >
                      Pay Cash
                    </button>
                  </div>
                  <p className="banner error" style={{ marginTop: '0.75rem' }}>
                    Card payments need <span className="plate">VITE_STRIPE_PUBLIC_KEY</span> in your environment.
                  </p>
                </>
              )}
            </section>
          ) : null}

          <section className="panel">
            <h2>Servizio</h2>
            <div className="service-grid">
              <div className="service-box">
                <div className="service-label">Inizio servizio</div>
                <div className="service-value">{hhmm(tripMeta?.service_start_time)}</div>
              </div>
              <div className="service-box">
                <div className="service-label">Fine servizio</div>
                <div className="service-value">{hhmm(tripMeta?.service_end_time)}</div>
              </div>
            </div>

            <div className="service-actions">
              <button
                type="button"
                className="btn btn-primary btn-block btn-big"
                disabled={saving || completed || started}
                onClick={() => {
                  const now = new Date().toISOString()
                  updateService({
                    service_start_time: now,
                    start_km: toNumberOrNull(startKm),
                  })
                }}
              >
                {saving && !started ? 'Attendere…' : 'Inizia servizio'}
              </button>

              <div className="field">
                <label className="field-label" htmlFor="km-start">
                  KM iniziali
                </label>
                <input
                  id="km-start"
                  className="input"
                  inputMode="decimal"
                  type="number"
                  step="0.1"
                  value={startKm}
                  placeholder="—"
                  onChange={(e) => {
                    setStartKmDirty(true)
                    setStartKm(e.target.value)
                  }}
                  onBlur={() => {
                    if (completed) return
                    const v = toNumberOrNull(startKm)
                    updateService({ start_km: v })
                  }}
                />
              </div>

              <button
                type="button"
                className="btn btn-primary btn-block btn-big"
                disabled={saving || completed || !started}
                onClick={() => {
                  const now = new Date().toISOString()
                  updateService({
                    service_end_time: now,
                    end_km: toNumberOrNull(endKm),
                  })
                }}
              >
                {saving && started ? 'Attendere…' : 'Termina servizio'}
              </button>

              <div className="field">
                <label className="field-label" htmlFor="km-end">
                  KM finali
                </label>
                <input
                  id="km-end"
                  className="input"
                  inputMode="decimal"
                  type="number"
                  step="0.1"
                  value={endKm}
                  placeholder="—"
                  onChange={(e) => {
                    setEndKmDirty(true)
                    setEndKm(e.target.value)
                  }}
                  onBlur={() => {
                    if (completed) return
                    const v = toNumberOrNull(endKm)
                    updateService({ end_km: v })
                  }}
                />
              </div>

              {canReset ? (
                <button
                  type="button"
                  className="btn btn-danger btn-block"
                  disabled={saving}
                  onClick={() => setShowResetModal(true)}
                >
                  Reset servizio
                </button>
              ) : null}
            </div>
          </section>

          <section className="panel">
            <h2>Autista</h2>
            {data.driver ? (
              <p>
                <strong>{data.driver.name}</strong>
                <br />
                <a className="tel" href={`tel:${data.driver.phone}`}>
                  {data.driver.phone}
                </a>
              </p>
            ) : (
              <p className="muted">Non assegnato</p>
            )}
          </section>

          <section className="panel">
            <h2>Veicolo</h2>
            {data.vehicle ? (
              <p>
                <strong>{data.vehicle.name}</strong>
                {data.vehicle.plate && (
                  <>
                    <br />
                    <span className="plate">{data.vehicle.plate}</span>
                  </>
                )}
              </p>
            ) : (
              <p className="muted">Non assegnato</p>
            )}
          </section>

          {data.service_date && (
            <p className="service-date-line">
              Data servizio: <strong>{data.service_date}</strong>
            </p>
          )}

          <section className="panel bookings-panel">
            <h2>Prenotazioni</h2>
            {data.bookings?.length === 0 && (
              <p className="muted">Nessuna prenotazione collegata a questo trip.</p>
            )}
            <ul className="booking-list">
              {(data.bookings || []).map((b) => (
                <li key={b.id} className="booking-row">
                  <div className="booking-main">
                    <span className="booking-name">{b.customer_name}</span>
                    <span className="booking-people">
                      {b.people} {b.people === 1 ? 'persona' : 'persone'}
                    </span>
                  </div>
                  <span className={b.checked_in ? 'badge in' : 'badge pending'}>
                    {b.checked_in ? 'Check-in OK' : 'In attesa'}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      {showResetModal ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <h3>Conferma reset</h3>
            <p className="muted">
              Sei sicuro di voler resettare il servizio? Verranno cancellati orari e chilometri.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn"
                disabled={saving}
                onClick={() => setShowResetModal(false)}
              >
                Annulla
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={saving}
                onClick={handleResetService}
              >
                Conferma reset
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
