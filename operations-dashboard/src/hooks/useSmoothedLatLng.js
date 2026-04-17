import { useEffect, useRef, useState } from 'react'

/**
 * Interpolates map coordinates so markers move smoothly between WebSocket updates.
 */
export function useSmoothedLatLng(lat, lng, durationMs = 480) {
  const posRef = useRef(null)
  const rafRef = useRef(0)
  const [pos, setPos] = useState(null)

  useEffect(() => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined

    const to = [lat, lng]
    const from = posRef.current
    if (!from || (from[0] === to[0] && from[1] === to[1])) {
      posRef.current = to
      setPos(to)
      return undefined
    }

    cancelAnimationFrame(rafRef.current)
    const start = performance.now()

    const tick = (now) => {
      const t = Math.min(1, (now - start) / durationMs)
      const e = 1 - (1 - t) ** 3
      const nlat = from[0] + (to[0] - from[0]) * e
      const nlng = from[1] + (to[1] - from[1]) * e
      const next = [nlat, nlng]
      posRef.current = next
      setPos(next)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [lat, lng, durationMs])

  return pos
}
