import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import L from 'leaflet'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'

import axios from '../api/axios.js'

const POLL_MS = 5000

function FitBounds({ points }) {
  const map = useMap()
  useEffect(() => {
    if (!points.length) return
    const bounds = L.latLngBounds(points)
    map.fitBounds(bounds, { padding: [36, 36], maxZoom: 15 })
  }, [map, points])
  return null
}

export default function TrackDriverPage() {
  const { token: raw } = useParams()
  const token = raw ? decodeURIComponent(raw) : ''

  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!token) return
    try {
      const { data: d } = await axios.get(`/track/${encodeURIComponent(token)}`)
      setData(d)
      setError(null)
    } catch (e) {
      setError(e.response?.data?.detail || e.message || 'Tracking unavailable.')
    }
  }, [token])

  useEffect(() => {
    void load()
    const id = setInterval(() => {
      void load()
    }, POLL_MS)
    return () => clearInterval(id)
  }, [load])

  const points = useMemo(() => {
    if (!data) return []
    const out = []
    if (data.pickup_lat != null && data.pickup_lng != null) {
      out.push([Number(data.pickup_lat), Number(data.pickup_lng)])
    }
    if (data.destination_lat != null && data.destination_lng != null) {
      out.push([Number(data.destination_lat), Number(data.destination_lng)])
    }
    if (data.driver_lat != null && data.driver_lng != null) {
      out.push([Number(data.driver_lat), Number(data.driver_lng)])
    }
    return out
  }, [data])

  const center = points[0] || [41.9, 12.5]

  if (!token) {
    return (
      <div className="page-narrow">
        <p>Invalid tracking link.</p>
        <Link to="/explore">Home</Link>
      </div>
    )
  }

  return (
    <div className="track-page">
      <div className="track-page__head page-narrow" style={{ paddingTop: '1rem', maxWidth: '40rem' }}>
        <h1 style={{ marginTop: 0 }}>Track your driver</h1>
        {data ? (
          <p className="landing-muted" style={{ marginBottom: '0.5rem' }}>
            Trip #{data.trip_id} · Status: <strong style={{ color: 'var(--text-h)' }}>{data.status}</strong>
          </p>
        ) : null}
        {error ? <p className="banner-err">{error}</p> : null}
        {data?.pickup || data?.destination ? (
          <p style={{ textAlign: 'left', fontSize: '0.95rem', margin: '0.5rem 0 0' }}>
            {data.pickup ? (
              <>
                <strong>Pickup:</strong> {data.pickup}
                <br />
              </>
            ) : null}
            {data.destination ? (
              <>
                <strong>Destination:</strong> {data.destination}
              </>
            ) : null}
          </p>
        ) : null}
        <p style={{ marginTop: '1rem' }}>
          <Link to="/explore" className="btn btn-ghost">
            Home
          </Link>
        </p>
      </div>

      <div className="track-page__map">
        <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
          <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {points.length > 1 ? <FitBounds points={points} /> : null}
          {data?.pickup_lat != null && data?.pickup_lng != null ? (
            <Marker position={[Number(data.pickup_lat), Number(data.pickup_lng)]}>
              <Popup>Pickup</Popup>
            </Marker>
          ) : null}
          {data?.destination_lat != null && data?.destination_lng != null ? (
            <Marker position={[Number(data.destination_lat), Number(data.destination_lng)]}>
              <Popup>Destination</Popup>
            </Marker>
          ) : null}
          {data?.driver_lat != null && data?.driver_lng != null ? (
            <Marker position={[Number(data.driver_lat), Number(data.driver_lng)]}>
              <Popup>Driver</Popup>
            </Marker>
          ) : null}
        </MapContainer>
      </div>
    </div>
  )
}
