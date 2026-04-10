import { useEffect, useRef } from 'react'

export function useWebSocketTrips({ onEvent } = {}) {
  const wsRef = useRef(null)

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8000/ws/trips')
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
        onEvent?.(data)
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
  }, [onEvent])

  return {
    send: (payload) => {
      const ws = wsRef.current
      if (!ws || ws.readyState !== WebSocket.OPEN) return
      ws.send(typeof payload === 'string' ? payload : JSON.stringify(payload))
    },
  }
}

