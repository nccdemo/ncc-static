import { useEffect, useRef } from 'react'

/** Set `VITE_ENABLE_TRIPS_WS=true` to opt in when `/ws/trips` exists on the backend. */
const WS_TRIPS_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_WS_TRIPS_URL) ||
  `${typeof window !== 'undefined' && window.location?.protocol === 'https:' ? 'wss' : 'ws'}://${
    typeof window !== 'undefined' ? window.location.host : 'localhost'
  }/ws/trips`

const WS_DEFAULT_ENABLED =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_ENABLE_TRIPS_WS === 'true'

function normalizeDriverFromEvent(evt) {
  // Accept both shapes:
  // - { driver_id, lat, lng }
  // - { id, latitude, longitude }
  const id = evt?.driver_id ?? evt?.id
  const latitude = evt?.lat ?? evt?.latitude
  const longitude = evt?.lng ?? evt?.longitude
  if (id == null) return null
  const d = { id }
  if (latitude != null) d.latitude = latitude
  if (longitude != null) d.longitude = longitude
  return d
}

export function useTripsWebSocket({ onEvent, enabled = WS_DEFAULT_ENABLED, url = WS_TRIPS_URL } = {}) {
  const wsRef = useRef(null)
  const reconnectTimerRef = useRef(null)
  const attemptRef = useRef(0)
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  useEffect(() => {
    if (!enabled) return
    if (!url) return

    let closedByEffect = false

    function clearReconnect() {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
    }

    function scheduleReconnect() {
      clearReconnect()
      attemptRef.current += 1
      const attempt = attemptRef.current
      const delay = Math.min(15000, 500 * 2 ** Math.min(attempt, 5))
      console.log(`[ws] reconnecting in ${delay}ms (attempt ${attempt})`)
      reconnectTimerRef.current = setTimeout(connect, delay)
    }

    function connect() {
      clearReconnect()

      try {
        const ws = new WebSocket(url)
        wsRef.current = ws

        ws.onopen = () => {
          attemptRef.current = 0
          console.log('WebSocket connected')
        }

        ws.onmessage = (msg) => {
          try {
            const parsed = JSON.parse(msg.data)
            console.log('WebSocket message:', parsed)

            // Normalize driver payloads while keeping backward-compatible fields.
            if (parsed?.event === 'driver_location_update') {
              const driver = normalizeDriverFromEvent(parsed)
              if (driver) {
                parsed.driver = { ...(parsed.driver ?? {}), ...driver }
              }
            }

            if (parsed?.event === 'trip_live_update') {
              const driver = normalizeDriverFromEvent(parsed?.driver)
              if (driver) {
                parsed.driver = { ...(parsed.driver ?? {}), ...driver }
              }
            }

            if (parsed && typeof onEventRef.current === 'function') {
              onEventRef.current(parsed)
            }
          } catch (e) {
            console.warn('[ws] invalid message', e)
          }
        }

        ws.onclose = (evt) => {
          wsRef.current = null
          if (closedByEffect) return
          console.log('WebSocket disconnected')
          console.log('[ws] disconnected details', evt?.code, evt?.reason)
          scheduleReconnect()
        }

        ws.onerror = () => {
          // onclose will handle the reconnect
        }
      } catch (e) {
        console.log('[ws] connect error', e)
        scheduleReconnect()
      }
    }

    connect()

    return () => {
      closedByEffect = true
      clearReconnect()
      if (wsRef.current) {
        try {
          wsRef.current.close()
        } catch {
          // ignore
        }
      }
      wsRef.current = null
    }
  }, [enabled, url])
}

