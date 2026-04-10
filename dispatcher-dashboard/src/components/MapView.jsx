import { useMemo } from 'react'
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

const iconDriver = makeDotIcon('#3b82f6') // blue
const iconPickup = makeDotIcon('#22c55e') // green
const iconDropoff = makeDotIcon('#ef4444') // red

function toLatLng(lat, lng) {
  const la = Number(lat)
  const lo = Number(lng)
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null
  return [la, lo]
}

export function MapView({ drivers, trips, selectedTripId }) {
  const centerItaly = [41.8719, 12.5674]

  const selectedTrip = useMemo(
    () => trips.find((t) => String(t.id) === String(selectedTripId)) || null,
    [trips, selectedTripId],
  )

  const pickupPos = selectedTrip
    ? toLatLng(selectedTrip.pickup_lat, selectedTrip.pickup_lng)
    : null
  const dropoffPos = selectedTrip
    ? toLatLng(selectedTrip.dropoff_lat, selectedTrip.dropoff_lng)
    : null

  const assignedDriver = useMemo(() => {
    if (!selectedTrip?.driver?.id) return null
    return drivers.find((d) => String(d.id) === String(selectedTrip.driver.id)) || null
  }, [drivers, selectedTrip])

  const driverPos = assignedDriver
    ? toLatLng(assignedDriver.latitude, assignedDriver.longitude)
    : null

  const line = driverPos && pickupPos ? [driverPos, pickupPos] : null

  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl border border-slate-800 bg-slate-950/30 p-4">
      <div className="flex shrink-0 items-center justify-between">
        <div className="text-sm font-semibold">Live map</div>
        <div className="text-xs text-slate-400">
          {selectedTrip ? `Trip #${selectedTrip.id}` : 'Select a trip'}
        </div>
      </div>

      <div className="mt-3 min-h-0 flex-1 rounded-xl border border-slate-800">
        <MapContainer
          center={centerItaly}
          zoom={6}
          minZoom={5}
          maxZoom={18}
          scrollWheelZoom
          className="z-0"
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Drivers (all) */}
          {drivers
            .filter((d) => d.latitude != null && d.longitude != null)
            .map((d) => {
              const pos = toLatLng(d.latitude, d.longitude)
              if (!pos) return null
              return (
                <Marker key={`driver-${d.id}`} position={pos} icon={iconDriver}>
                  <Tooltip direction="top" offset={[0, -10]} opacity={0.9}>
                    Driver #{d.id} — {d.name}
                    <br />
                    {pos[0].toFixed(5)}, {pos[1].toFixed(5)}
                  </Tooltip>
                </Marker>
              )
            })}

          {/* Pickup + dropoff for selected trip */}
          {pickupPos && (
            <Marker position={pickupPos} icon={iconPickup}>
              <Tooltip direction="top" offset={[0, -10]} opacity={0.9}>
                Pickup
                <br />
                {pickupPos[0].toFixed(5)}, {pickupPos[1].toFixed(5)}
              </Tooltip>
            </Marker>
          )}
          {dropoffPos && (
            <Marker position={dropoffPos} icon={iconDropoff}>
              <Tooltip direction="top" offset={[0, -10]} opacity={0.9}>
                Dropoff
                <br />
                {dropoffPos[0].toFixed(5)}, {dropoffPos[1].toFixed(5)}
              </Tooltip>
            </Marker>
          )}

          {/* Optional: driver -> pickup line */}
          {line && <Polyline positions={line} pathOptions={{ color: '#60a5fa' }} />}
        </MapContainer>
      </div>

      <div className="mt-3 grid shrink-0 grid-cols-1 gap-2 text-xs md:grid-cols-3">
        <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-slate-200">
          <span className="text-slate-400">Drivers:</span> {drivers.length}
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

