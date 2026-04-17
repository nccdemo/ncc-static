import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'

import api from '../api/axios.js'

const POLL_MS = 4000

function makeDotIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width: 16px;
      height: 16px;
      border-radius: 9999px;
      background: ${color};
      border: 2px solid rgba(255,255,255,0.95);
      box-shadow: 0 4px 12px rgba(0,0,0,0.35);
    "></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  })
}

const iconDriver = makeDotIcon('#2563eb')
const iconPickup = makeDotIcon('#16a34a')
const iconDrop = makeDotIcon('#dc2626')

function toPos(lat, lng) {
  const la = Number(lat)
  const lo = Number(lng)
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null
  return [la, lo]
}

function TrackFitBounds({ pointsKey }) {
  const map = useMap()
  useEffect(() => {
    map.invalidateSize()
  }, [map, pointsKey])

  useEffect(() => {
    try {
      const raw = JSON.parse(pointsKey || '[]')
      const pts = raw.filter((p) => Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))
      if (pts.length === 0) return
      if (pts.length === 1) {
        map.setView(pts[0], 13)
        return
      }
      map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 15, animate: true })
    } catch {
      /* ignore */
    }
  }, [map, pointsKey])

  return null
}

export default function TrackPage() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!token) {
      setError('Token mancante')
      setLoading(false)
      return
    }
    setError('')
    try {
      const { data: body } = await api.get(`/track/${encodeURIComponent(token)}`)
      setData(body)
    } catch (e) {
      const d = e?.response?.data?.detail
      setError(typeof d === 'string' ? d : 'Tracciamento non disponibile')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    load()
    const id = window.setInterval(load, POLL_MS)
    return () => window.clearInterval(id)
  }, [load])

  const pickupPos = data ? toPos(data.pickup_lat, data.pickup_lng) : null
  const destPos = data ? toPos(data.destination_lat, data.destination_lng) : null
  const driverPos = data ? toPos(data.driver_lat, data.driver_lng) : null

  const pointsKey = useMemo(() => {
    const pts = [pickupPos, destPos, driverPos].filter(Boolean)
    return JSON.stringify(pts)
  }, [pickupPos, destPos, driverPos])

  const routeLine = useMemo(() => {
    if (!pickupPos || !destPos) return null
    return [pickupPos, destPos]
  }, [pickupPos, destPos])

  const defaultCenter = [41.9, 12.5]

  return (
    <div className="flex min-h-dvh flex-col bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-4 py-4">
        <h1 className="text-lg font-semibold tracking-tight">Segui la corsa</h1>
        <p className="mt-1 text-sm text-slate-400">
          Posizione autista aggiornata automaticamente
          {data?.trip_id != null ? (
            <>
              {' '}
              · Trip #{data.trip_id}
            </>
          ) : null}
        </p>
        {data?.status ? (
          <p className="mt-2 text-xs uppercase tracking-wide text-sky-400">Stato: {data.status}</p>
        ) : null}
      </header>

      <main className="flex flex-1 flex-col px-4 pb-8 pt-4">
        {loading && !data ? <p className="text-sm text-slate-400">Caricamento mappa…</p> : null}
        {error ? (
          <p className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-100">{error}</p>
        ) : null}

        {data ? (
          <div className="mt-2 flex min-h-[min(420px,55vh)] flex-1 flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40">
            <MapContainer
              center={pickupPos || driverPos || defaultCenter}
              zoom={6}
              minZoom={4}
              maxZoom={18}
              scrollWheelZoom
              className="z-0 min-h-0 flex-1"
              style={{ width: '100%', height: '100%', minHeight: 320 }}
            >
              <TrackFitBounds pointsKey={pointsKey} />
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {pickupPos && (
                <Marker position={pickupPos} icon={iconPickup}>
                  <Tooltip>Partenza</Tooltip>
                </Marker>
              )}
              {destPos && (
                <Marker position={destPos} icon={iconDrop}>
                  <Tooltip>Destinazione</Tooltip>
                </Marker>
              )}
              {driverPos && (
                <Marker position={driverPos} icon={iconDriver}>
                  <Tooltip>Autista</Tooltip>
                </Marker>
              )}
              {routeLine && <Polyline positions={routeLine} pathOptions={{ color: '#64748b', dashArray: '6 8' }} />}
            </MapContainer>
            {data.pickup || data.destination ? (
              <div className="shrink-0 space-y-2 border-t border-slate-800 px-3 py-3 text-sm text-slate-300">
                {data.pickup ? (
                  <div>
                    <span className="text-slate-500">Da:</span> {data.pickup}
                  </div>
                ) : null}
                {data.destination ? (
                  <div>
                    <span className="text-slate-500">A:</span> {data.destination}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </main>
    </div>
  )
}
