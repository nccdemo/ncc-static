import { useCallback, useEffect, useMemo, useState } from 'react'
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'

import { useSmoothedLatLng } from '../hooks/useSmoothedLatLng.js'
import { createDriverCarIcon, createPinIcon } from '../map/driverCarIcon.js'

const TILES = {
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
  light: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
  },
}

const iconPickup = createPinIcon({ color: '#22c55e', label: 'Pickup' })
const iconDropoff = createPinIcon({ color: '#f87171', label: 'Dropoff' })

function toLatLng(lat, lng) {
  const la = Number(lat)
  const lo = Number(lng)
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null
  return [la, lo]
}

function tripDestinationCoords(trip) {
  const la = trip?.dropoff_lat ?? trip?.destination_lat
  const lo = trip?.dropoff_lng ?? trip?.destination_lng
  return toLatLng(la, lo)
}

/** Match active trip row to driver (API uses driver name string; some paths expose driver object). */
function findTripForDriver(driver, trips) {
  const id = String(driver.id)
  const name = (driver.name || '').trim().toLowerCase()
  return (
    trips.find((t) => {
      if (t.driver_id != null && String(t.driver_id) === id) return true
      if (t.driver && typeof t.driver === 'object' && t.driver.id != null && String(t.driver.id) === id) return true
      if (typeof t.driver === 'string' && t.driver.trim() && t.driver.trim().toLowerCase() === name) return true
      return false
    }) || null
  )
}

function statusTone(status) {
  const s = String(status || '').toUpperCase()
  if (s.includes('CANCEL')) return '#f87171'
  if (s.includes('COMPLETE')) return '#34d399'
  if (s.includes('EN_ROUTE') || s.includes('ARRIVED') || s.includes('PROGRESS')) return '#fbbf24'
  if (s.includes('ASSIGN') || s.includes('ACCEPT')) return '#60a5fa'
  return '#94a3b8'
}

function DriverMapMarker({ driver, trip }) {
  const lat = Number(driver.latitude)
  const lng = Number(driver.longitude)
  const pos = useSmoothedLatLng(lat, lng)
  const icon = useMemo(() => createDriverCarIcon(driver.id), [driver.id])

  if (!pos) return null

  const status = trip?.status ?? '—'
  const pickupLine = trip?.pickup || trip?.booking?.pickup || '—'
  const destLine = trip?.destination || trip?.booking?.destination || '—'

  return (
    <Marker position={pos} icon={icon}>
      <Popup className="ncc-map-popup">
        <div className="ncc-popup-inner">
          <div className="ncc-popup-title">{driver.name || `Driver #${driver.id}`}</div>
          <div className="ncc-popup-meta">ID {driver.id}</div>
          {trip ? (
            <>
              <div className="ncc-popup-divider" />
              <div className="ncc-popup-row">
                <span className="ncc-popup-label">Trip</span>
                <span className="ncc-popup-value">#{trip.id}</span>
              </div>
              <div className="ncc-popup-row">
                <span className="ncc-popup-label">Status</span>
                <span className="ncc-popup-badge" style={{ color: statusTone(status), borderColor: `${statusTone(status)}55` }}>
                  {status}
                </span>
              </div>
              <div className="ncc-popup-block">
                <div className="ncc-popup-label">Pickup</div>
                <div className="ncc-popup-text">{pickupLine}</div>
              </div>
              <div className="ncc-popup-block">
                <div className="ncc-popup-label">Destination</div>
                <div className="ncc-popup-text">{destLine}</div>
              </div>
              {trip.eta_to_pickup_minutes != null ? (
                <div className="ncc-popup-row">
                  <span className="ncc-popup-label">ETA pickup</span>
                  <span className="ncc-popup-value">{trip.eta_to_pickup_minutes} min</span>
                </div>
              ) : null}
            </>
          ) : (
            <p className="ncc-popup-empty">No active trip linked to this driver on the board.</p>
          )}
        </div>
      </Popup>
    </Marker>
  )
}

/** Keeps Leaflet sized correctly inside flex / resizable layouts. */
function MapLeafletResize() {
  const map = useMap()
  useEffect(() => {
    const el = map.getContainer()
    const target = el.parentElement ?? el
    const ro = new ResizeObserver(() => {
      map.invalidateSize()
    })
    ro.observe(target)
    map.invalidateSize()
    return () => ro.disconnect()
  }, [map])
  return null
}

/**
 * Live driver positions from WebSocket; trip pickup / destination for selection.
 */
export function MapView({ drivers, trips, selectedTripId }) {
  const centerItaly = [41.8719, 12.5674]
  const [darkMap, setDarkMap] = useState(true)

  const selectedTrip = useMemo(
    () => trips.find((t) => String(t.id) === String(selectedTripId)) || null,
    [trips, selectedTripId],
  )

  const pickupPos = selectedTrip ? toLatLng(selectedTrip.pickup_lat, selectedTrip.pickup_lng) : null
  const dropoffPos = selectedTrip ? tripDestinationCoords(selectedTrip) : null

  const assignedDriver = useMemo(() => {
    if (!selectedTrip) return null
    const did =
      selectedTrip.driver_id ??
      (selectedTrip.driver && typeof selectedTrip.driver === 'object' ? selectedTrip.driver.id : null)
    if (did == null) return null
    return drivers.find((d) => String(d.id) === String(did)) || null
  }, [drivers, selectedTrip])

  const driverPos = assignedDriver ? toLatLng(assignedDriver.latitude, assignedDriver.longitude) : null

  const line = driverPos && pickupPos ? [driverPos, pickupPos] : null

  const driversOnMap = useMemo(
    () =>
      drivers.filter(
        (d) =>
          d.latitude != null &&
          d.longitude != null &&
          Number.isFinite(Number(d.latitude)) &&
          Number.isFinite(Number(d.longitude)),
      ),
    [drivers],
  )

  const tile = darkMap ? TILES.dark : TILES.light

  const toggleMapTheme = useCallback(() => {
    setDarkMap((v) => !v)
  }, [])

  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl border border-slate-800 bg-slate-950/30 p-4">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold tracking-tight">Live map</div>
          <div className="text-xs text-slate-500">Drivers animate smoothly · tap a vehicle for details</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={toggleMapTheme}
            className="rounded-lg border border-slate-700 bg-slate-900/80 px-2.5 py-1.5 text-xs font-medium text-slate-200 shadow-sm transition hover:border-slate-500 hover:bg-slate-800"
          >
            {darkMap ? 'Dark basemap' : 'Light basemap'}
          </button>
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-1.5 text-xs text-slate-400">
            {selectedTrip ? `Trip #${selectedTrip.id}` : 'Select a trip'}
          </div>
        </div>
      </div>

      <div className="ncc-map-frame mt-3 flex min-h-[280px] flex-1 flex-col overflow-hidden rounded-xl border border-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <MapContainer
          center={centerItaly}
          zoom={6}
          minZoom={5}
          maxZoom={18}
          scrollWheelZoom
          className={`z-0 min-h-0 flex-1 ncc-leaflet-map${darkMap ? ' ncc-leaflet-map--dark' : ''}`}
          style={{ width: '100%', height: '100%', minHeight: 240 }}
        >
          <MapLeafletResize />
          <TileLayer key={darkMap ? 'dark' : 'light'} attribution={tile.attribution} url={tile.url} />

          {driversOnMap.map((d) => (
            <DriverMapMarker key={`driver-${d.id}`} driver={d} trip={findTripForDriver(d, trips)} />
          ))}

          {pickupPos && (
            <Marker position={pickupPos} icon={iconPickup}>
              <Popup className="ncc-map-popup">
                <div className="ncc-popup-inner">
                  <div className="ncc-popup-title">Pickup</div>
                  {selectedTrip?.pickup ? <div className="ncc-popup-text">{selectedTrip.pickup}</div> : null}
                  <div className="ncc-popup-meta font-mono">
                    {pickupPos[0].toFixed(5)}, {pickupPos[1].toFixed(5)}
                  </div>
                </div>
              </Popup>
            </Marker>
          )}
          {dropoffPos && (
            <Marker position={dropoffPos} icon={iconDropoff}>
              <Popup className="ncc-map-popup">
                <div className="ncc-popup-inner">
                  <div className="ncc-popup-title">Destination</div>
                  {selectedTrip?.destination ? <div className="ncc-popup-text">{selectedTrip.destination}</div> : null}
                  <div className="ncc-popup-meta font-mono">
                    {dropoffPos[0].toFixed(5)}, {dropoffPos[1].toFixed(5)}
                  </div>
                </div>
              </Popup>
            </Marker>
          )}

          {line && <Polyline positions={line} pathOptions={{ color: '#38bdf8', weight: 3, opacity: 0.85 }} />}
        </MapContainer>
      </div>

      <div className="mt-3 grid shrink-0 grid-cols-1 gap-2 text-xs md:grid-cols-3">
        <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-slate-200">
          <span className="text-slate-400">On map:</span> {driversOnMap.length}
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-slate-200">
          <span className="text-slate-400">Active trips:</span> {trips.length}
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-slate-200">
          <span className="text-slate-400">ETA:</span>{' '}
          {selectedTrip?.eta_to_pickup_minutes ?? '—'} min
        </div>
      </div>
    </div>
  )
}
