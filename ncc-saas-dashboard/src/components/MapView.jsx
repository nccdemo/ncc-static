import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, Marker, Polyline, TileLayer, Tooltip } from 'react-leaflet'
import L from 'leaflet'

function makeDotIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width: 14px;
      height: 14px;
      border-radius: 9999px;
      background: ${color};
      border: 2px solid rgba(255,255,255,0.9);
      box-shadow: 0 6px 14px rgba(0,0,0,0.35);
    "></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  })
}

const iconDriverAvailable = makeDotIcon('#22c55e') // green
const iconDriverOnTrip = makeDotIcon('#ef4444') // red
const iconDriverOffline = makeDotIcon('#9ca3af') // gray
const iconPickup = makeDotIcon('#22c55e') // green
const iconDropoff = makeDotIcon('#ef4444') // red

function statusIcon(status) {
  if (status === 'available') return iconDriverAvailable
  if (status === 'on_trip') return iconDriverOnTrip
  return iconDriverOffline
}

function toLatLng(lat, lng) {
  const la = Number(lat)
  const lo = Number(lng)
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null
  return [la, lo]
}

function interpolate(start, end, t) {
  return [
    start[0] + (end[0] - start[0]) * t,
    start[1] + (end[1] - start[1]) * t,
  ]
}

function AnimatedDriverMarker({ from, to, icon, children }) {
  const [position, setPosition] = useState(from)
  const rafRef = useRef(null)

  useEffect(() => {
    setPosition(from)
  }, [from])

  useEffect(() => {
    if (!from || !to) return undefined
    if (from[0] === to[0] && from[1] === to[1]) {
      setPosition(to)
      return undefined
    }

    let startTime = null
    const durationMs = 1000

    function animate(timestamp) {
      if (startTime == null) startTime = timestamp
      const progress = Math.min(1, (timestamp - startTime) / durationMs)
      setPosition(interpolate(from, to, progress))
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate)
      }
    }

    rafRef.current = requestAnimationFrame(animate)

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [from, to])

  return (
    <Marker position={position} icon={icon}>
      {children}
    </Marker>
  )
}

export function MapView({ drivers = [], trips = [], showLines = true }) {
  const mapCenter = [45.0, 9.0]
  const prevPositionsRef = useRef({})

  const driverMarkers = useMemo(() => {
    return (drivers ?? [])
      .map((d) => {
        const pos = toLatLng(d.latitude, d.longitude)
        if (!pos) return null
        return { key: `driver-${d.id}`, d, pos }
      })
      .filter(Boolean)
  }, [drivers])

  useEffect(() => {
    const next = {}
    for (const { d, pos } of driverMarkers) {
      next[d.id] = pos
    }
    prevPositionsRef.current = next
  }, [driverMarkers])

  const tripMarkers = useMemo(() => {
    return (trips ?? [])
      .map((t) => {
        const b = t?.bookings?.[0] ?? t?.booking ?? null
        const pickup = toLatLng(
          t.pickup_lat ?? b?.pickup_latitude ?? b?.pickup_lat,
          t.pickup_lng ?? b?.pickup_longitude ?? b?.pickup_lng,
        )
        const dropoff = toLatLng(
          t.dropoff_lat ?? b?.dropoff_latitude ?? b?.dropoff_lat,
          t.dropoff_lng ?? b?.dropoff_longitude ?? b?.dropoff_lng,
        )
        const driver = t.raw?.driver ?? t.driver
        const driverPos = driver ? toLatLng(driver.latitude, driver.longitude) : null
        return {
          id: t.id,
          status: t.status,
          pickup,
          dropoff,
          driverPos,
        }
      })
      .filter((x) => x.pickup || x.dropoff || x.driverPos)
  }, [trips])

  const lines = useMemo(() => {
    if (!showLines) return []
    return tripMarkers
      .map((t) => {
        if (!t.driverPos || !t.pickup) return null
        return { key: `line-${t.id}`, positions: [t.driverPos, t.pickup] }
      })
      .filter(Boolean)
  }, [tripMarkers, showLines])

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col rounded-xl border border-border bg-card">
      <div className="flex shrink-0 items-center justify-between px-5 py-4">
        <div className="text-sm font-semibold">Live map</div>
        <div className="text-xs text-muted-foreground">
          Drivers: {driverMarkers.length} • Trips: {trips.length}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-b-xl">
        <MapContainer
          center={mapCenter}
          zoom={6}
          minZoom={3}
          maxZoom={18}
          scrollWheelZoom
          className="z-0 h-full w-full"
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {driverMarkers.map(({ key, d, pos }) => {
            const from = prevPositionsRef.current?.[d.id] ?? pos
            const to = pos
            return (
              <AnimatedDriverMarker key={key} from={from} to={to} icon={statusIcon(d.status)}>
                <Tooltip direction="top" offset={[0, -10]} opacity={0.9}>
                  <span className="font-semibold">{d.name ?? `Driver #${d.id}`}</span>
                  <br />
                  <span className="text-xs opacity-90">
                    {to[0].toFixed(5)}, {to[1].toFixed(5)}
                  </span>
                </Tooltip>
              </AnimatedDriverMarker>
            )
          })}

          {/* Trip pickup/dropoff markers (static) */}
          {tripMarkers.map((t) => (
            <Fragment key={`trip-${t.id}`}>
              {t.pickup ? (
                <Marker position={t.pickup} icon={iconPickup}>
                  <Tooltip direction="top" offset={[0, -10]} opacity={0.9}>
                    Pickup — Trip #{t.id}
                    <br />
                    {t.pickup[0].toFixed(5)}, {t.pickup[1].toFixed(5)}
                  </Tooltip>
                </Marker>
              ) : null}
              {t.dropoff ? (
                <Marker position={t.dropoff} icon={iconDropoff}>
                  <Tooltip direction="top" offset={[0, -10]} opacity={0.9}>
                    Dropoff — Trip #{t.id}
                    <br />
                    {t.dropoff[0].toFixed(5)}, {t.dropoff[1].toFixed(5)}
                  </Tooltip>
                </Marker>
              ) : null}
            </Fragment>
          ))}

          {lines.map((l) => (
            <Polyline key={l.key} positions={l.positions} pathOptions={{ color: '#60a5fa' }} />
          ))}
        </MapContainer>
      </div>
    </div>
  )
}
