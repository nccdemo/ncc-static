import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import axios from '../api/axios.js'
import './AvailableTrips.css'

function formatPrice(v) {
  if (v == null || v === '' || Number.isNaN(Number(v))) return '—'
  return `€${Number(v).toFixed(2)}`
}

function formatDateTime(eta) {
  if (eta == null || eta === '') return '—'
  try {
    const d = new Date(eta)
    if (Number.isNaN(d.getTime())) return String(eta)
    return d.toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return String(eta)
  }
}

/** Haversine distance in km; returns null if coords missing. */
function distanceKm(pickupLat, pickupLng, destLat, destLng) {
  const a = [pickupLat, pickupLng, destLat, destLng].map((x) => (x == null ? NaN : Number(x)))
  if (a.some((n) => !Number.isFinite(n))) return null
  const [lat1, lon1, lat2, lon2] = a
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
  return Math.round(R * c * 10) / 10
}

/** Unassigned: no driver_id and no assigned driver name from API. */
function isTripUnassigned(t) {
  if (t.driver_id != null && t.driver_id !== '') return false
  if (t.driver != null && String(t.driver).trim() !== '') return false
  return true
}

/** Parse trip ETA to ms; null if missing/invalid. */
function tripTimeMs(t) {
  if (t?.eta == null || t.eta === '') return null
  const ms = new Date(t.eta).getTime()
  return Number.isNaN(ms) ? null : ms
}

function tripPriceValue(t) {
  const n = Number(t?.price)
  return Number.isFinite(n) ? n : null
}

/**
 * Most relevant first: soonest time, then highest price.
 * Trips without time sort after those with time; missing price sorts last within the same time group.
 */
function compareTripsByRelevance(a, b) {
  const ta = tripTimeMs(a)
  const tb = tripTimeMs(b)
  const aTime = ta != null
  const bTime = tb != null
  if (aTime && bTime && ta !== tb) return ta - tb
  if (aTime && !bTime) return -1
  if (!aTime && bTime) return 1

  const pa = tripPriceValue(a)
  const pb = tripPriceValue(b)
  const va = pa ?? -Infinity
  const vb = pb ?? -Infinity
  if (vb !== va) return vb - va
  return Number(b.id) - Number(a.id)
}

function pickupText(t) {
  return String(t.pickup_address ?? t.pickup ?? '')
}

/** Case-insensitive substring match on pickup (city or address). */
function matchesPickupFilter(t, query) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return pickupText(t).toLowerCase().includes(q)
}

/** Min/max inclusive; null bound means no limit. Trips without a finite price excluded when any bound is set. */
function matchesPriceFilter(t, min, max) {
  if (min == null && max == null) return true
  const p = tripPriceValue(t)
  if (p == null) return false
  if (min != null && p < min) return false
  if (max != null && p > max) return false
  return true
}

export default function AvailableTrips() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [toast, setToast] = useState(null)
  const [pickupFilter, setPickupFilter] = useState('')
  const [priceMinStr, setPriceMinStr] = useState('')
  const [priceMaxStr, setPriceMaxStr] = useState('')
  /** Blocks rapid double-clicks before `busyId` state is committed. */
  const acceptInFlightRef = useRef(false)

  const priceMin = useMemo(() => {
    const s = priceMinStr.trim()
    if (!s) return null
    const n = Number(s)
    return Number.isFinite(n) ? n : null
  }, [priceMinStr])

  const priceMax = useMemo(() => {
    const s = priceMaxStr.trim()
    if (!s) return null
    const n = Number(s)
    return Number.isFinite(n) ? n : null
  }, [priceMaxStr])

  const filteredRows = useMemo(() => {
    let list = rows.filter((t) => matchesPickupFilter(t, pickupFilter))
    if (priceMin != null || priceMax != null) {
      list = list.filter((t) => matchesPriceFilter(t, priceMin, priceMax))
    }
    return list
  }, [rows, pickupFilter, priceMin, priceMax])

  const filtersActive =
    pickupFilter.trim() !== '' || priceMinStr.trim() !== '' || priceMaxStr.trim() !== ''

  useEffect(() => {
    if (!toast) return undefined
    const id = window.setTimeout(() => setToast(null), 4200)
    return () => window.clearTimeout(id)
  }, [toast])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await axios.get('/dispatch/trips/active')
      console.log('Trips loaded:', res.data)
      const raw = Array.isArray(res.data) ? res.data : []
      const open = raw.filter(isTripUnassigned).sort(compareTripsByRelevance)
      setRows(open)
    } catch (e) {
      console.error(e)
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function acceptTrip(tripId) {
    if (acceptInFlightRef.current || loading) return
    acceptInFlightRef.current = true
    setBusyId(tripId)
    try {
      await axios.post(`/trips/${tripId}/accept`)
      setToast({ type: 'success', message: 'Trip accepted' })
      await load()
    } catch (e) {
      setToast({ type: 'error', message: 'Trip already taken' })
    } finally {
      setBusyId(null)
      acceptInFlightRef.current = false
    }
  }

  const anyAcceptBusy = busyId != null
  const acceptDisabledGlobal = loading || anyAcceptBusy

  return (
    <div className="available-trips">
      <header className="available-trips__header">
        <div>
          <h1 className="available-trips__title">Available Trips</h1>
          <p className="available-trips__subtitle">
            Open trips with no driver assigned. Accept to assign yourself.
          </p>
        </div>
        <button
          type="button"
          className="available-trips__refresh"
          onClick={() => load()}
          disabled={loading || anyAcceptBusy}
        >
          Refresh
        </button>
      </header>

      {toast ? (
        <div
          className={`available-trips__toast available-trips__toast--${toast.type}`}
          role="status"
          aria-live="polite"
        >
          {toast.message}
        </div>
      ) : null}

      {loading && rows.length === 0 ? (
        <div className="available-trips__loading">
          <div className="available-trips__spinner" aria-hidden />
          <p style={{ margin: 0 }}>Loading trips…</p>
        </div>
      ) : null}

      {!loading && rows.length === 0 ? (
        <div className="available-trips__empty">No trips available</div>
      ) : null}

      {!loading && rows.length > 0 ? (
        <div className="available-trips__filters" role="search" aria-label="Filter trips">
          <div className="available-trips__filter-field">
            <label className="available-trips__filter-label" htmlFor="available-trips-pickup">
              Pickup / city
            </label>
            <input
              id="available-trips-pickup"
              type="search"
              className="available-trips__filter-input"
              placeholder="e.g. Milano"
              value={pickupFilter}
              onChange={(e) => setPickupFilter(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="available-trips__filter-field available-trips__filter-field--price">
            <span className="available-trips__filter-label">Price (€)</span>
            <div className="available-trips__price-range">
              <input
                type="text"
                inputMode="decimal"
                className="available-trips__filter-input available-trips__filter-input--narrow"
                placeholder="Min"
                value={priceMinStr}
                onChange={(e) => setPriceMinStr(e.target.value)}
                aria-label="Minimum price"
              />
              <span className="available-trips__price-sep" aria-hidden>
                –
              </span>
              <input
                type="text"
                inputMode="decimal"
                className="available-trips__filter-input available-trips__filter-input--narrow"
                placeholder="Max"
                value={priceMaxStr}
                onChange={(e) => setPriceMaxStr(e.target.value)}
                aria-label="Maximum price"
              />
            </div>
          </div>
          {filtersActive ? (
            <button
              type="button"
              className="available-trips__filter-clear"
              onClick={() => {
                setPickupFilter('')
                setPriceMinStr('')
                setPriceMaxStr('')
              }}
            >
              Clear filters
            </button>
          ) : null}
        </div>
      ) : null}

      {!loading && rows.length > 0 && filteredRows.length === 0 ? (
        <div className="available-trips__empty available-trips__empty--filters">
          No trips match your filters.
        </div>
      ) : null}

      {filteredRows.length > 0 ? (
        <div className="available-trips__grid-wrap">
          {loading ? (
            <div className="available-trips__grid-overlay" aria-busy="true" aria-label="Updating trips">
              <div className="available-trips__spinner available-trips__spinner--sm" />
            </div>
          ) : null}
          <div className="available-trips__grid">
          {filteredRows.map((t) => {
            const pickupAddress = t.pickup_address ?? t.pickup ?? '—'
            const dropoffAddress = t.dropoff_address ?? t.destination ?? '—'
            const price = t.price
            const dist = distanceKm(t.pickup_lat, t.pickup_lng, t.destination_lat, t.destination_lng)
            const thisTripAccepting = busyId === t.id
            return (
              <article key={t.id} className="available-trips__card">
                <div className="available-trips__card-head">
                  <span className="available-trips__trip-id">Trip #{t.id}</span>
                  <span className="available-trips__badge available-trips__badge--available">Available</span>
                </div>
                <div className="available-trips__card-body">
                  <div>
                    <div className="available-trips__label">Pickup</div>
                    <div className="available-trips__pickup">{pickupAddress}</div>
                  </div>
                  <div>
                    <div className="available-trips__label">Dropoff</div>
                    <div className="available-trips__dropoff">{dropoffAddress}</div>
                  </div>
                  <div>
                    <div className="available-trips__label">Date &amp; time</div>
                    <div className="available-trips__datetime">{formatDateTime(t.eta)}</div>
                  </div>
                  {dist != null ? (
                    <div>
                      <div className="available-trips__label">Distance</div>
                      <div className="available-trips__distance">{dist} km (approx.)</div>
                    </div>
                  ) : null}
                  <div>
                    <div className="available-trips__label">Price</div>
                    <div className="available-trips__price">{formatPrice(price)}</div>
                  </div>
                </div>
                <button
                  type="button"
                  className="available-trips__accept"
                  onClick={() => acceptTrip(t.id)}
                  disabled={acceptDisabledGlobal}
                  aria-busy={thisTripAccepting}
                  aria-label={thisTripAccepting ? 'Accepting trip' : `Accept trip ${t.id}`}
                >
                  {thisTripAccepting ? 'Accepting…' : 'Accept Trip'}
                </button>
              </article>
            )
          })}
          </div>
        </div>
      ) : null}
    </div>
  )
}
