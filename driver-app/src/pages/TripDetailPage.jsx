import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import api from '../api/axios.js'
import ServiceSheet from '../components/ServiceSheet.jsx'
import { formatApiDetail } from '../lib/api.js'

/**
 * Deep link to a trip: same service flow as ``DriverWorkPage`` (ServiceSheet is the single source).
 */
export default function TripDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const tripId = Number(id)
  const [driverId, setDriverId] = useState(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setErr('')
      try {
        const { data } = await api.get('/driver/me')
        if (cancelled) return
        const did = data?.driver_id
        if (did == null || Number.isNaN(Number(did))) {
          setErr('Profilo autista non trovato.')
          setDriverId(null)
        } else {
          setDriverId(Number(did))
        }
      } catch (e) {
        if (!cancelled) {
          setErr(formatApiDetail(e?.response?.data?.detail) || 'Errore caricamento profilo.')
          setDriverId(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <div className="mobile-page">
        <p className="muted" style={{ padding: '1.5rem' }}>
          Caricamento…
        </p>
      </div>
    )
  }

  if (err || driverId == null || !Number.isFinite(tripId)) {
    return (
      <div className="mobile-page">
        <p className="form-error" role="alert">
          {err || 'Corsa non valida.'}
        </p>
        <button type="button" className="btn-primary" onClick={() => navigate('/driver/tours-today')}>
          Torna indietro
        </button>
      </div>
    )
  }

  return (
    <ServiceSheet
      tripId={tripId}
      driverId={driverId}
      onBack={() => navigate('/driver/tours-today')}
      onOpenScan={() => navigate('/driver/today', { state: { openScanForTrip: tripId } })}
    />
  )
}
