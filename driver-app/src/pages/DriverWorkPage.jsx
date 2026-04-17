import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import api from '../api/axios.js'
import { wsApiUrl } from '../api/apiUrl.js'
import { getToken } from '../auth/token.js'
import { formatApiDetail, readDriverSession } from '../lib/api.js'
import LoadingScreen from '../components/LoadingScreen'
import QrScanner from '../components/QrScanner'
import DriverStripeConnect from '../components/DriverStripeConnect'
import ServiceSheet from '../components/ServiceSheet'
import SimpleTripHome from '../components/SimpleTripHome.jsx'

/** Active trips, service sheet, QR check-in, km, PDF (via ServiceSheet). */
export default function DriverWorkPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const accessToken = getToken()
  /** Riferimento stabile finché il JWT non cambia (evita dipendenze useEffect su oggetto nuovo ogni render). */
  const session = useMemo(() => readDriverSession(), [accessToken])
  const [driverId, setDriverId] = useState(null)
  const [driverBoot, setDriverBoot] = useState({ loading: true, error: '' })
  const [loading, setLoading] = useState(true)
  const [fadeOut, setFadeOut] = useState(false)
  const initialLoadDoneRef = useRef(false)

  const [view, setView] = useState('list')
  const [selectedTripId, setSelectedTripId] = useState(null)
  const [trips, setTrips] = useState([])
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState('')

  /** Deep link: apri scanner per un trip (es. da TripDetail → “Scan QR”). */
  useEffect(() => {
    const raw = location.state?.openScanForTrip
    const tid = raw != null ? Number(raw) : NaN
    if (!Number.isFinite(tid)) return
    setSelectedTripId(tid)
    setView('scan')
    navigate(location.pathname, { replace: true, state: {} })
  }, [location.pathname, location.state, navigate])

  /** Boot profilo: dipende solo dal JWT (stringa stabile), mai dall’oggetto session (nuovo a ogni render). */
  useEffect(() => {
    let cancelled = false
    setDriverBoot({ loading: true, error: '' })

    if (!accessToken) {
      // eslint-disable-next-line no-console
      console.warn('[DriverWorkPage] Nessun token: skip GET /driver/me')
      setDriverId(null)
      setDriverBoot({
        loading: false,
        error: 'Sessione non disponibile. Torna al login.',
      })
      return undefined
    }

    if (!readDriverSession()) {
      // eslint-disable-next-line no-console
      console.warn('[DriverWorkPage] Token presente ma ruolo non driver')
      setDriverId(null)
      setDriverBoot({
        loading: false,
        error: 'Sessione non valida per autista.',
      })
      return undefined
    }

    ;(async () => {
      let errorMsg = ''
      try {
        // eslint-disable-next-line no-console
        console.log('[DriverWorkPage] GET /api/driver/me …')
        const { data } = await api.get('/driver/me')
        if (cancelled) return
        // eslint-disable-next-line no-console
        console.log('[DriverWorkPage] GET /api/driver/me ok', { driver_id: data?.driver_id })
        const id = data?.driver_id
        if (id == null || Number.isNaN(Number(id))) {
          setDriverId(null)
          errorMsg = 'Profilo autista non trovato per questo account.'
        } else {
          setDriverId(Number(id))
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[DriverWorkPage] GET /api/driver/me errore', e)
        setDriverId(null)
        errorMsg =
          formatApiDetail(e?.response?.data?.detail) ||
          (typeof e?.message === 'string' ? e.message : '') ||
          'Errore caricamento profilo autista.'
      } finally {
        if (!cancelled) {
          // eslint-disable-next-line no-console
          console.log('[DriverWorkPage] boot profilo completato', { error: errorMsg || null })
          setDriverBoot({ loading: false, error: errorMsg })
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [accessToken])

  const loadTrips = useCallback(
    async (silent = false) => {
      if (driverId == null) return
      if (!silent) {
        setListLoading(true)
        setListError('')
      }
      try {
        const { data } = await api.get(`/drivers/${driverId}/trips`)
        const list = Array.isArray(data)
          ? data
          : Array.isArray(data?.items)
            ? data.items
            : Array.isArray(data?.trips)
              ? data.trips
              : []
        setTrips(list)
      } catch (e) {
        console.error('API ERROR:', e)
        if (!silent) {
          let msg = 'Could not load trips'
          if (e?.code === 'ERR_NETWORK' || e?.message === 'Network Error') {
            msg = 'Network error — check connection and that the API is reachable (VITE_API_URL or /api proxy).'
          } else if (e?.response?.data?.detail != null) {
            msg = formatApiDetail(e.response.data.detail)
          } else if (typeof e?.response?.status === 'number') {
            msg = `Request failed (HTTP ${e.response.status}).`
          }
          setListError(msg)
          setTrips([])
        }
      } finally {
        if (!silent) setListLoading(false)
      }
    },
    [driverId],
  )

  useEffect(() => {
    if (driverId == null) return
    loadTrips(false)
  }, [loadTrips, driverId])

  useEffect(() => {
    if (driverId == null) return
    if (initialLoadDoneRef.current) return
    if (listLoading) return

    initialLoadDoneRef.current = true
    let t2 = null
    const t1 = setTimeout(() => {
      setFadeOut(true)
      t2 = setTimeout(() => setLoading(false), 400)
    }, 600)

    return () => {
      clearTimeout(t1)
      if (t2 != null) clearTimeout(t2)
    }
  }, [listLoading, driverId])

  useEffect(() => {
    if (view !== 'list' && view !== 'sheet') return undefined
    const id = setInterval(() => {
      loadTrips(true)
    }, 5000)
    return () => clearInterval(id)
  }, [view, loadTrips])

  useEffect(() => {
    if (driverId == null) return undefined
    const url = wsApiUrl('/ws/trips')
    let ws
    try {
      ws = new WebSocket(url)
    } catch {
      return undefined
    }
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data)
        if (msg?.event === 'trip_updated') loadTrips(true)
      } catch {
        /* ignore */
      }
    }
    return () => {
      try {
        ws.close()
      } catch {
        /* ignore */
      }
    }
  }, [driverId, loadTrips])

  const handleRefresh = useCallback(async () => {
    await loadTrips(false)
  }, [loadTrips])

  const handleCheckIn = useCallback(
    async (qr) => {
      const tid = selectedTripId
      if (tid == null) {
        return {
          variant: 'error',
          message:
            'Nessun viaggio selezionato. Apri il foglio servizio del trip corretto e usa “Scan QR” da lì.',
        }
      }
      try {
        const { data } = await api.post('/checkin', {
          qr,
          expected_trip_id: tid,
        })
        await loadTrips(false)
        setView('sheet')
        return {
          variant: 'success',
          message: data?.message || 'Check-in effettuato',
        }
      } catch (e) {
        console.error('API ERROR:', e)
        const status = e.response?.status
        const detail = formatApiDetail(e.response?.data?.detail)
        const text =
          detail ||
          (status === 403
            ? 'QR non valido per questo viaggio o viaggio non assegnato a te.'
            : status === 404
              ? 'Prenotazione o viaggio non trovato.'
              : 'Check-in non riuscito')
        if (status === 400 && /already|già/i.test(text)) {
          return { variant: 'warn', message: text }
        }
        return { variant: 'error', message: text }
      }
    },
    [loadTrips, selectedTripId],
  )

  const openSheet = (tripId) => {
    setSelectedTripId(tripId)
    setView('sheet')
  }

  const openScan = useCallback(() => {
    if (selectedTripId == null) return
    setView('scan')
  }, [selectedTripId])

  const backToList = () => {
    setSelectedTripId(null)
    setView('list')
    loadTrips(false)
  }

  const closeScan = () => {
    setView(selectedTripId != null ? 'sheet' : 'list')
    loadTrips(false)
  }

  if (!session) {
    return null
  }

  if (driverBoot.loading) {
    return (
      <div className="mobile-page">
        <p className="muted" style={{ padding: '2rem' }}>
          Caricamento profilo autista…
        </p>
      </div>
    )
  }

  if (driverBoot.error || driverId == null) {
    return (
      <div className="mobile-page">
        <header className="mobile-header">
          <h1>Lavoro</h1>
        </header>
        <p className="form-error" role="alert">
          {driverBoot.error || 'ID autista non disponibile.'}
        </p>
        <button
          type="button"
          className="btn-primary"
          onClick={() => window.location.reload()}
        >
          Riprova
        </button>
      </div>
    )
  }

  return (
    <div className="app-shell">
      {loading && <LoadingScreen className={fadeOut ? 'fade-out' : ''} />}
      <div className="container">
        <header className="app-header header">
          <span className="logo">Lavoro</span>
          <div className="header-actions">
            {view === 'list' && (
              <button type="button" className="btn btn-ghost btn-tiny" onClick={handleRefresh}>
                Refresh
              </button>
            )}
          </div>
        </header>

        <main className="app-main">
          {view === 'list' && (
            <>
              <SimpleTripHome
                driverId={driverId}
                trips={trips}
                loading={listLoading}
                listError={listError}
                onOpenService={openSheet}
                onTripsChanged={() => loadTrips(false)}
              />
              <div className="mt-6 border-t border-slate-800 pt-4">
                <DriverStripeConnect />
              </div>
            </>
          )}
          {view === 'sheet' && selectedTripId != null && (
            <ServiceSheet
              tripId={selectedTripId}
              driverId={driverId}
              onBack={backToList}
              onOpenScan={openScan}
            />
          )}
          {view === 'scan' && selectedTripId != null && (
            <QrScanner tripId={selectedTripId} onCheckIn={handleCheckIn} onBack={closeScan} />
          )}
        </main>
      </div>
    </div>
  )
}
