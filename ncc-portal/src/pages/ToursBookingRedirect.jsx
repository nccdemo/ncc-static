import { useEffect, useMemo } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'

/**
 * Guest opens ``/tours/:tourId?ref=CODE`` on the portal; we forward to the public booking app
 * with the same ref (localStorage is per-origin, so ref must stay in the URL).
 */
export default function ToursBookingRedirect() {
  const { tourId } = useParams()
  const [searchParams] = useSearchParams()
  const ref = (searchParams.get('ref') || '').trim()

  const target = useMemo(() => {
    const base = (import.meta.env.VITE_CLIENT_TOURS_URL || 'http://localhost:5173').replace(/\/$/, '')
    const tid = String(tourId || '').trim()
    if (!tid) return `${base}/tours`
    const q = new URLSearchParams()
    if (ref) q.set('ref', ref)
    q.set('tour_id', tid)
    return `${base}/tours?${q.toString()}`
  }, [tourId, ref])

  useEffect(() => {
    window.location.replace(target)
  }, [target])

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif', color: '#334155' }}>
      <p style={{ margin: 0 }}>Reindirizzamento al catalogo tour…</p>
    </main>
  )
}
