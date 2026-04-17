import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'

import {
  getStoredReferralCode,
  persistReferralFromHost,
  persistReferralFromUrlSearch,
} from '../utils/referralStorage'

import { apiUrl } from '../api/apiUrl.js'
import { postTourInstanceBooking } from '../api/bookTourInstance.js'

if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.__nccPostTourInstanceBooking = postTourInstanceBooking
}

function formatSelectedDate(iso) {
  if (iso == null || iso === '') return null
  const s = String(iso)
  const dayPart = s.length >= 10 ? s.slice(0, 10) : null
  if (dayPart && /^\d{4}-\d{2}-\d{2}$/.test(dayPart)) {
    const [y, m, d] = dayPart.split('-').map(Number)
    const local = new Date(y, m - 1, d)
    return local.toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }
  try {
    const dt = new Date(s)
    if (!Number.isNaN(dt.getTime())) {
      return dt.toLocaleDateString(undefined, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    }
  } catch {
    // fall through
  }
  return String(iso)
}

function referralCodeForCheckout(search) {
  persistReferralFromUrlSearch(search)
  const params = new URLSearchParams(String(search || '').startsWith('?') ? String(search).slice(1) : search)
  if (!params.get('ref')) {
    persistReferralFromHost()
  }
  return getStoredReferralCode()
}

export default function Checkout() {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const fromState = location.state ?? {}
  const tourFromState = fromState.tour && typeof fromState.tour === 'object' ? fromState.tour : null

  const tourInstanceId =
    fromState.tour_instance_id ??
    (searchParams.get('tour_instance_id') ? Number(searchParams.get('tour_instance_id')) : null)

  const [tourRemote, setTourRemote] = useState(null)

  const maxPeople =
    fromState.max_people != null
      ? Number(fromState.max_people)
      : null

  const title =
    String(
      tourFromState?.title ?? tourRemote?.title ?? fromState.title ?? searchParams.get('title') ?? '',
    ).trim() || 'Tour'
  const baseRaw =
    tourFromState?.base_price ??
    tourRemote?.base_price ??
    fromState.base_price ??
    searchParams.get('base_price')
  const basePrice = typeof baseRaw === 'number' ? baseRaw : parseFloat(String(baseRaw ?? ''))

  const final_price = useMemo(() => {
    if (Number.isNaN(basePrice)) return NaN
    return Math.round(basePrice * 1.25 * 100) / 100
  }, [basePrice])

  const [qty, setQty] = useState(1)
  const [customerName, setCustomerName] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [instance, setInstance] = useState(null)

  const instanceIdNum = tourInstanceId != null ? Number(tourInstanceId) : NaN
  const hasInstanceId = Number.isFinite(instanceIdNum) && instanceIdNum > 0
  const dateEffective =
    String(
      fromState.date ??
        fromState.selected_date ??
        searchParams.get('selected_date') ??
        (instance?.date != null ? String(instance.date) : ''),
    ).trim()
  const hasSelectedDate = dateEffective.length > 0
  const selectedDateDisplayLive = formatSelectedDate(hasSelectedDate ? dateEffective : null)

  /** Checkout is only valid when tied to a specific bookable turn (date). */
  const canProceed = hasInstanceId && hasSelectedDate

  const peopleMax =
    maxPeople != null && Number.isFinite(maxPeople) && maxPeople > 0
      ? maxPeople
      : instance?.available_seats != null && Number.isFinite(Number(instance.available_seats))
        ? Number(instance.available_seats)
        : 99
  const seatsMax =
    instance?.available_seats != null && Number.isFinite(Number(instance.available_seats)) && Number(instance.available_seats) > 0
      ? Number(instance.available_seats)
      : peopleMax

  useEffect(() => {
    // Clamp qty to [1, seatsMax] whenever seatsMax changes or user edits qty.
    if (!Number.isFinite(Number(qty))) return
    if (qty < 1) setQty(1)
    else if (qty > seatsMax) setQty(seatsMax)
  }, [qty, seatsMax])

  useEffect(() => {
    let cancelled = false
    async function loadInstance() {
      if (!hasInstanceId) {
        setInstance(null)
        setTourRemote(null)
        return
      }
      try {
        const res = await fetch(apiUrl(`/api/tour-instances/${Number(tourInstanceId)}`))
        const data = await res.json().catch(() => null)
        if (!res.ok) {
          if (!cancelled) setInstance(null)
          return
        }
        if (!cancelled) setInstance(data && typeof data === 'object' ? data : null)

        if (tourFromState) {
          if (!cancelled) setTourRemote(null)
        } else if (data && typeof data === 'object' && data.tour_id != null) {
          const tr = await fetch(apiUrl(`/api/tours/${Number(data.tour_id)}`))
          const t = await tr.json().catch(() => null)
          if (!cancelled && tr.ok && t && typeof t === 'object') {
            setTourRemote({
              title: String(t.title || ''),
              base_price: Number(t.price) || 0,
              city: t.city,
            })
          }
        } else if (!cancelled) {
          setTourRemote(null)
        }
      } catch {
        if (!cancelled) {
          setInstance(null)
          setTourRemote(null)
        }
      }
    }
    void loadInstance()
    return () => {
      cancelled = true
    }
  }, [hasInstanceId, tourInstanceId, tourFromState])

  async function handlePay() {
    setError('')
    if (!canProceed) {
      setError('Seleziona un turno dalla pagina Tour prima di pagare.')
      return
    }
    setLoading(true)
    try {
      const fromNav =
        fromState.referral_code != null && String(fromState.referral_code).trim()
          ? String(fromState.referral_code).trim().toUpperCase()
          : ''
      const referral = fromNav || referralCodeForCheckout(location.search) || undefined
      const name = customerName.trim() || 'Cliente'
      const em = email.trim()
      if (!em || !/^\S+@\S+\.\S+$/.test(em)) {
        setError('Inserisci un indirizzo email valido.')
        return
      }
      const p = Math.min(Math.max(1, Number(qty) || 1), seatsMax)
      /** Confirmed booking + pagamento: creati lato server al completamento Stripe (webhook). */
      const res = await fetch(apiUrl('/api/payments/create-checkout'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tour_instance_id: Number(tourInstanceId),
          people: p,
          customer_name: name,
          email: em,
          referral_code: referral ?? null,
          has_bnb: Boolean(referral),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg =
          typeof data.detail === 'string'
            ? data.detail
            : Array.isArray(data.detail)
              ? data.detail.map((d) => d.msg || d).join(', ')
              : data.message || `Request failed (${res.status})`
        setError(msg)
        return
      }
      const checkoutUrl = data.checkout_url ?? data.url
      if (!checkoutUrl) {
        setError('No checkout URL in response')
        return
      }
      window.location.href = checkoutUrl
    } finally {
      setLoading(false)
    }
  }

  if (Number.isNaN(final_price) || Number.isNaN(basePrice)) {
    return (
      <div style={{ padding: 24, maxWidth: 480 }}>
        <h1 style={{ marginTop: 0 }}>Checkout</h1>
        <p>
          Missing or invalid tour pricing. Return to <Link to="/tours">Tour</Link>, pick a slot, then
          continue.
        </p>
        <Link to="/tours">← Tour</Link>
      </div>
    )
  }

  const totalEstimate =
    canProceed && Number.isFinite(final_price)
      ? Math.round(final_price * Math.min(Math.max(1, Number(qty) || 1), seatsMax) * 100) / 100
      : final_price

  const payDisabled = loading || !canProceed || !email.trim()

  return (
    <div style={{ padding: 24, maxWidth: 480 }}>
      <h1 style={{ marginTop: 0 }}>Checkout</h1>

      {!canProceed ? (
        <div
          role="alert"
          style={{
            marginBottom: 16,
            padding: 12,
            borderRadius: 8,
            background: '#fef3c7',
            border: '1px solid #f59e0b',
            color: '#92400e',
            fontSize: 14,
          }}
        >
          <strong>Nessuna data selezionata.</strong> Vai su{' '}
          <Link to="/tours">Tour</Link> e scegli una data con posti disponibili, poi &quot;Prenota&quot;.
        </div>
      ) : null}

      <section
        style={{
          marginBottom: 20,
          padding: 16,
          borderRadius: 12,
          border: '1px solid #e5e7eb',
          background: '#fafafa',
        }}
      >
        <h2 style={{ margin: '0 0 12px 0', fontSize: 14, fontWeight: 600, color: '#374151' }}>
          Riepilogo
        </h2>

        {canProceed && instance && (instance.driver_name || instance.vehicle_name || instance.vehicle_plate) ? (
          <div
            style={{
              marginBottom: 12,
              padding: 10,
              borderRadius: 10,
              border: '1px solid #e5e7eb',
              background: 'white',
              fontSize: 13,
              lineHeight: 1.5,
              color: '#111827',
            }}
          >
            {instance.driver_name ? (
              <div>
                <strong>Driver:</strong> {instance.driver_name}
              </div>
            ) : null}
            {instance.vehicle_name ? (
              <div>
                <strong>Vehicle:</strong> {instance.vehicle_name}
              </div>
            ) : null}
            {instance.vehicle_plate ? (
              <div>
                <strong>Plate:</strong> {instance.vehicle_plate}
              </div>
            ) : null}
          </div>
        ) : null}

        <dl style={{ margin: 0, lineHeight: 1.7 }}>
          <dt style={{ fontSize: 12, color: '#6b7280' }}>Tour</dt>
          <dd style={{ margin: '2px 0 12px 0', fontSize: 17, fontWeight: 700 }}>{title}</dd>

          <dt style={{ fontSize: 12, color: '#6b7280' }}>Data scelta</dt>
          <dd style={{ margin: '2px 0 12px 0', fontSize: 16, fontWeight: 600 }}>
            {canProceed && selectedDateDisplayLive ? selectedDateDisplayLive : '— (non selezionata)'}
          </dd>

          <dt style={{ fontSize: 12, color: '#6b7280' }}>Base price</dt>
          <dd style={{ margin: '2px 0 12px 0', fontSize: 16 }}>€{basePrice.toFixed(2)}</dd>

          <dt style={{ fontSize: 12, color: '#6b7280' }}>Final price</dt>
          <dd style={{ margin: '2px 0 0 0', fontSize: 18, fontWeight: 700 }}>€{final_price.toFixed(2)}</dd>
          <dd style={{ margin: '4px 0 0 0', fontSize: 12, color: '#6b7280' }}>per person (base × 1.25)</dd>
        </dl>
      </section>

      {canProceed ? (
        <>
          <dl style={{ margin: '16px 0', lineHeight: 1.6 }}>
            <dt style={{ fontSize: 12, color: '#666', marginTop: 8 }}>Partecipanti</dt>
            <dd style={{ margin: '4px 0 0 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setQty((q) => Math.max(1, Number(q) - 1))}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    border: '1px solid #d1d5db',
                    background: 'white',
                    cursor: 'pointer',
                    fontSize: 18,
                    lineHeight: 1,
                  }}
                  aria-label="Decrease participants"
                >
                  -
                </button>

                <input
                  type="number"
                  value={qty}
                  min={1}
                  max={seatsMax}
                  onChange={(e) => setQty(Number(e.target.value))}
                  style={{
                    width: '60px',
                    textAlign: 'center',
                    padding: 8,
                    borderRadius: 10,
                    border: '1px solid #d1d5db',
                  }}
                />

                <button
                  type="button"
                  onClick={() => setQty((q) => Math.min(seatsMax, Number(q) + 1))}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    border: '1px solid #d1d5db',
                    background: 'white',
                    cursor: 'pointer',
                    fontSize: 18,
                    lineHeight: 1,
                  }}
                  aria-label="Increase participants"
                >
                  +
                </button>
                <span style={{ fontSize: 13, color: '#666' }}>max {seatsMax} (posti sul turno)</span>
              </div>
            </dd>
            <dt style={{ fontSize: 12, color: '#666', marginTop: 12 }}>Nome</dt>
            <dd style={{ margin: '4px 0 0 0' }}>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Nome e cognome"
                style={{ width: '100%', maxWidth: 360, padding: 10, borderRadius: 8, border: '1px solid #ccc' }}
              />
            </dd>
            <dt style={{ fontSize: 12, color: '#666', marginTop: 12 }}>Email</dt>
            <dd style={{ margin: '4px 0 0 0' }}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@esempio.it"
                style={{ width: '100%', maxWidth: 360, padding: 10, borderRadius: 8, border: '1px solid #ccc' }}
              />
            </dd>
            <dt style={{ fontSize: 12, color: '#666', marginTop: 12 }}>Totale stimato</dt>
            <dd style={{ margin: '4px 0 0 0', fontWeight: 700 }}>
              €{totalEstimate.toFixed(2)} ({Math.min(Math.max(1, Number(qty) || 1), seatsMax)} × €
              {final_price.toFixed(2)})
            </dd>
          </dl>
        </>
      ) : null}

      {error ? (
        <p role="alert" style={{ color: '#b00020', marginBottom: 12 }}>
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={handlePay}
        disabled={payDisabled}
        style={{
          marginTop: 8,
          width: '100%',
          maxWidth: 400,
          padding: '14px 20px',
          fontSize: 16,
          fontWeight: 600,
          border: 'none',
          borderRadius: 12,
          background: payDisabled ? '#93c5fd' : '#2563eb',
          color: 'white',
          cursor: payDisabled ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.85 : 1,
        }}
      >
        {loading ? 'Redirecting…' : 'Pay with card'}
      </button>

      {canProceed && !email.trim() ? (
        <p style={{ fontSize: 13, color: '#666', marginTop: 8 }}>Enter email to enable payment.</p>
      ) : null}

      <p style={{ marginTop: 24 }}>
        <Link to="/tours">← Tour</Link>
      </p>
    </div>
  )
}
