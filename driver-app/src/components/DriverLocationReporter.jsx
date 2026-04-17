import { useCallback, useEffect, useRef, useState } from 'react'

import { postDriverLocation } from '../api/driverLocation.js'

const SEND_INTERVAL_MS = 5000
const RESTART_EVENT = 'driver:location-restart'

const GEO_OPTIONS = {
  enableHighAccuracy: true,
  maximumAge: 4000,
  timeout: 25000,
}

function geolocationErrorMessage(code) {
  if (code === 1) return 'GPS: permesso negato. Abilita la posizione per inviare la tua corsa.'
  if (code === 2) return 'GPS: posizione non disponibile (segnale assente o disattivato).'
  if (code === 3) return 'GPS: timeout — segnale debole o in attesa del satellite.'
  return 'GPS: errore sconosciuto.'
}

/**
 * Watches geolocation and POSTs last fix every {@link SEND_INTERVAL_MS} to `/api/driver/location`.
 * Mount once under the authenticated driver shell.
 */
export default function DriverLocationReporter() {
  const [banner, setBanner] = useState(null)
  const latestRef = useRef(null)
  const watchIdRef = useRef(null)
  const intervalIdRef = useRef(null)
  const deniedRef = useRef(false)

  const clearWatchAndInterval = useCallback(() => {
    if (watchIdRef.current != null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    if (intervalIdRef.current != null) {
      window.clearInterval(intervalIdRef.current)
      intervalIdRef.current = null
    }
  }, [])

  const startWatch = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setBanner('GPS: il browser non supporta la geolocalizzazione.')
      return
    }
    if (deniedRef.current) {
      return
    }

    clearWatchAndInterval()
    setBanner(null)

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          latestRef.current = { lat, lng }
          setBanner(null)
        }
      },
      (err) => {
        const code = err?.code
        setBanner(geolocationErrorMessage(code))
        if (code === 1) {
          deniedRef.current = true
          clearWatchAndInterval()
        }
      },
      GEO_OPTIONS,
    )

    intervalIdRef.current = window.setInterval(() => {
      const last = latestRef.current
      if (!last || deniedRef.current) return
      postDriverLocation(last.lat, last.lng).catch(() => {
        setBanner((prev) => prev ?? 'Rete: impossibile inviare la posizione.')
      })
    }, SEND_INTERVAL_MS)
  }, [clearWatchAndInterval])

  useEffect(() => {
    deniedRef.current = false
    startWatch()
    const onRestart = () => {
      deniedRef.current = false
      startWatch()
    }
    window.addEventListener(RESTART_EVENT, onRestart)
    return () => {
      window.removeEventListener(RESTART_EVENT, onRestart)
      clearWatchAndInterval()
    }
  }, [clearWatchAndInterval, startWatch])

  if (!banner) return null

  return (
    <div
      className="form-error"
      style={{
        margin: '0 0 12px 0',
        padding: '10px 12px',
        borderRadius: 10,
        fontSize: '0.9rem',
      }}
      role="alert"
    >
      {banner}
    </div>
  )
}

export function requestDriverLocationRestart() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(RESTART_EVENT))
  }
}
