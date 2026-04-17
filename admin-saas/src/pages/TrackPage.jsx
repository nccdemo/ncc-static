import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet'
import L from 'leaflet'

import 'leaflet/dist/leaflet.css'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

import { api } from '../lib/api.js'

// Fix default marker icons in Vite builds
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
})

export function TrackPage() {
  const { token } = useParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [meta, setMeta] = useState(null)
  const [driverPos, setDriverPos] = useState(null)
  const [driverHint, setDriverHint] = useState('')
  const wsRef = useRef(null)

  useEffect(() => {
    let cancelled = false

    async function fetchTracking({ silent = false } = {}) {
      if (!silent) {
        setLoading(true)
        setError('')
      }
      try {
        const { data } = await api.get(`/api/track/${token}`)
        console.log('[tracking] meta:', data)
        if (cancelled) return
        setMeta(data)
      } catch (e) {
        if (cancelled) return
        // On poll failures, keep the last good meta and show a gentle message.
        if (!silent) setMeta(null)
        setError(e?.response?.data?.detail ?? e?.message ?? 'Tracking non disponibile')
      } finally {
        if (!cancelled && !silent) setLoading(false)
      }
    }

    // Initial load
    fetchTracking({ silent: false })

    // Poll every 5s for robustness (in case WS is unavailable).
    const interval = setInterval(() => {
      fetchTracking({ silent: true })
    }, 5000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [token])

  useEffect(() => {
    if (!meta?.trip_id) return undefined
    const url = `ws://${window.location.hostname}:8000/ws/tracking/${meta.trip_id}`
    const ws = new WebSocket(url)
    wsRef.current = ws
    setDriverHint('Driver non ancora disponibile')

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg && msg.lat != null && msg.lng != null) {
          setDriverPos([Number(msg.lat), Number(msg.lng)])
          setDriverHint('')
        }
      } catch {
        // ignore
      }
    }

    ws.onerror = () => {}
    ws.onclose = () => {}

    return () => {
      try {
        ws.close()
      } catch {
        // ignore
      }
    }
  }, [meta?.trip_id])

  const pickupPos = useMemo(() => {
    if (!meta?.pickup_lat || !meta?.pickup_lng) return null
    return [Number(meta.pickup_lat), Number(meta.pickup_lng)]
  }, [meta])

  const destPos = useMemo(() => {
    if (!meta?.destination_lat || !meta?.destination_lng) return null
    return [Number(meta.destination_lat), Number(meta.destination_lng)]
  }, [meta])

  const center = driverPos || pickupPos || destPos || [37.5023612, 15.0873718]

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-sm text-muted-foreground">
        Caricamento tracking…
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="rounded-2xl border border-border bg-card p-4 text-sm text-red-300">
          {error}
        </div>
      </div>
    )
  }

  // Safety: if driver isn't available yet, don't risk rendering assumptions downstream.
  // Still show pickup/destination so the page never feels "blank".
  if (!meta?.driver_id && !driverPos) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 text-sm">
          <div className="text-base font-semibold">Tracking</div>
          <div className="mt-1 text-sm text-muted-foreground">
            {meta?.pickup || '—'} → {meta?.destination || '—'}
          </div>
          <div className="mt-3 rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
            Driver non ancora disponibile
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-border bg-card">
        <div className="text-base font-semibold">Tracking</div>
        <div className="text-sm text-muted-foreground">
          {meta?.pickup || '—'} → {meta?.destination || '—'}
        </div>
        {!driverPos ? (
          <div className="mt-1 text-xs text-muted-foreground">{driverHint || 'Driver non ancora disponibile'}</div>
        ) : null}
      </div>

      <div className="flex-1">
        <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {pickupPos ? (
            <Marker position={pickupPos}>
              <Popup>Pickup</Popup>
            </Marker>
          ) : null}

          {destPos ? (
            <Marker position={destPos}>
              <Popup>Destinazione</Popup>
            </Marker>
          ) : null}

          {driverPos ? (
            <Marker position={driverPos}>
              <Popup>Autista</Popup>
            </Marker>
          ) : null}
        </MapContainer>
      </div>
    </div>
  )
}

