import { useEffect, useRef } from 'react'

function wsTripsUrl() {
  const fromEnv = String(import.meta.env.VITE_WS_TRIPS_URL || '').trim()
  if (fromEnv) return fromEnv
  if (typeof window === 'undefined') return 'ws://127.0.0.1:8000/ws/trips'
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}/ws/trips`
}

export function useWebSocketTrips({ onEvent } = {}) {
  const wsRef = useRef(null)
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  useEffect(() => {
    const ws = new WebSocket(wsTripsUrl())
    wsRef.current = ws

    ws.onopen = () => {
      // optional ping to keep connection alive
      try {
        ws.send('hello')
      } catch {
        // ignore
      }
    }

    ws.onmessage = (messageEvent) => {
      try {
        const data = JSON.parse(messageEvent.data)
        onEventRef.current?.(data)
      } catch {
        // ignore non-json messages
      }
    }

    ws.onerror = () => {
      // no-op: keep minimal for now
    }

    return () => {
      try {
        ws.close()
      } catch {
        // ignore
      }
    }
  }, [])

  return {
    send: (payload) => {
      const ws = wsRef.current
      if (!ws || ws.readyState !== WebSocket.OPEN) return
      ws.send(typeof payload === 'string' ? payload : JSON.stringify(payload))
    },
  }
}

