import { useEffect, useRef, useState } from 'react'
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet-rotatedmarker'

import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

// Fix Leaflet marker icons in bundlers (Vite)
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
})

function FixMap() {
  const map = useMap()

  useEffect(() => {
    setTimeout(() => {
      map.invalidateSize()
    }, 100)
  }, [map])

  return null
}

const carIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/744/744465.png',
  iconSize: [40, 40],
  iconAnchor: [20, 20],
})

function getBearing(start, end) {
  const lat1 = (start[0] * Math.PI) / 180
  const lng1 = (start[1] * Math.PI) / 180
  const lat2 = (end[0] * Math.PI) / 180
  const lng2 = (end[1] * Math.PI) / 180

  const y = Math.sin(lng2 - lng1) * Math.cos(lat2)
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(lng2 - lng1)

  const bearing = Math.atan2(y, x) * (180 / Math.PI)
  return (bearing + 360) % 360
}

function getDistance(a, b) {
  const R = 6371 // km
  const dLat = ((b[0] - a[0]) * Math.PI) / 180
  const dLng = ((b[1] - a[1]) * Math.PI) / 180

  const lat1 = (a[0] * Math.PI) / 180
  const lat2 = (b[0] * Math.PI) / 180

  const x = dLat / 2
  const y = dLng / 2

  const aVal =
    Math.sin(x) * Math.sin(x) +
    Math.sin(y) * Math.sin(y) * Math.cos(lat1) * Math.cos(lat2)

  const c = 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal))

  return R * c
}

export default function ClientMap() {
  const [position, setPosition] = useState([38.1383, 13.3584])
  const [rotation, setRotation] = useState(0)
  const [tripStatus] = useState('assigned')
  const clientPosition = [38.14, 13.36]
  const markerRef = useRef(null)
  const mapRef = useRef(null)
  const lastPosRef = useRef(position)
  const lastRotRef = useRef(0)
  const rafRef = useRef(null)

  function animateMarker(from, to, fromRot, toRot) {
    const duration = 500
    const start = performance.now()

    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }

    function animate(time) {
      const progress = Math.min((time - start) / duration, 1)

      const lat = from[0] + (to[0] - from[0]) * progress
      const lng = from[1] + (to[1] - from[1]) * progress
      const angle = fromRot + (toRot - fromRot) * progress

      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng])
        // Provided by leaflet-rotatedmarker
        if (typeof markerRef.current.setRotationAngle === 'function') {
          markerRef.current.setRotationAngle(angle)
        }
      }
      if (mapRef.current) {
        mapRef.current.panTo([lat, lng], { animate: true, duration: 0.5 })
      }

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate)
      } else {
        rafRef.current = null
      }
    }

    rafRef.current = requestAnimationFrame(animate)
  }

  useEffect(() => {
    const fetchLocation = async () => {
      try {
        const res = await fetch('/api/drivers/1/location')
        if (!res.ok) {
          console.error('Driver location request failed:', res.status)
          return
        }
        const data = await res.json()
        console.log('Driver data:', data)

        if (!data?.lat || !data?.lng) return
        const lat = Number(data.lat)
        const lng = Number(data.lng)
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return

        const next = [lat, lng]
        const prev = lastPosRef.current
        const nextBearing = getBearing(prev, next)
        setRotation(nextBearing)

        if (markerRef.current) {
          animateMarker(prev, next, lastRotRef.current, nextBearing)
        } else {
          // Initial render (before ref is ready)
          setPosition(next)
        }

        lastPosRef.current = next
        lastRotRef.current = nextBearing
      } catch (err) {
        console.error(err)
      }
    }

    fetchLocation()
    const interval = setInterval(fetchLocation, 3000)
    return () => {
      clearInterval(interval)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const distance = getDistance(position, clientPosition)
  const etaMinutes = Math.round((distance / 40) * 60)

  const topTitle =
    tripStatus === 'arrived' ? 'Il driver è arrivato 📍' : 'Il driver è in arrivo 🚗'

  if (tripStatus === 'on_trip') {
    return (
      <div
        style={{
          height: '100vh',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f9fafb',
        }}
      >
        <div
          style={{
            background: 'white',
            padding: '18px 20px',
            borderRadius: '16px',
            boxShadow: '0 4px 10px rgba(0,0,0,0.1)',
            fontWeight: 'bold',
            fontSize: '16px',
          }}
        >
          Corsa in corso 🚗
        </div>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', height: '100vh', width: '100%' }}>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1000 }}>
        <div
          style={{
            position: 'absolute',
            top: 20,
            left: 20,
            right: 20,
            background: 'white',
            padding: '15px',
            borderRadius: '15px',
            boxShadow: '0 4px 10px rgba(0,0,0,0.1)',
          }}
        >
          <div style={{ fontWeight: 'bold', fontSize: '16px' }}>{topTitle}</div>
          <div style={{ marginTop: '5px', color: '#555' }}>Arrivo in circa {etaMinutes} min</div>
        </div>

        <div
          style={{
            position: 'absolute',
            bottom: 20,
            left: 20,
            right: 20,
            background: 'white',
            padding: '15px',
            borderRadius: '15px',
            boxShadow: '0 4px 10px rgba(0,0,0,0.1)',
          }}
        >
          <div style={{ fontWeight: 'bold' }}>Driver</div>
          <div style={{ marginTop: '5px' }}>Mario Rossi</div>
          <div style={{ color: '#777', fontSize: '14px' }}>BMW Serie 5 • AB123CD</div>
        </div>
      </div>

      <MapContainer
        center={position}
        zoom={15}
        style={{ height: '100%', width: '100%' }}
        whenCreated={(map) => {
          mapRef.current = map
        }}
      >
        <FixMap />
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

      <Marker
        position={position}
        ref={markerRef}
        icon={carIcon}
        rotationAngle={rotation}
        rotationOrigin="center"
      >
        <Popup>Driver qui 🚗</Popup>
      </Marker>

      <Polyline positions={[position, clientPosition]} color="blue" />
      </MapContainer>
    </div>
  )
}

