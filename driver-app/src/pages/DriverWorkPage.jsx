import { useCallback, useEffect, useRef, useState } from 'react'

import api from '../api/axios.js'
import { formatApiDetail, readDriverSession } from '../lib/api.js'
import LoadingScreen from '../components/LoadingScreen'
import QrScanner from '../components/QrScanner'
import ServiceSheet from '../components/ServiceSheet'
import TripList from '../components/TripList'

/** Active trips, service sheet, and QR check-in (sidebar handles other sections). */
export default function DriverWorkPage() {
  const session = readDriverSession()
  const driverId = session?.driver?.id
  const [loading, setLoading] = useState(true)
  const [fadeOut, setFadeOut] = useState(false)
  const initialLoadDoneRef = useRef(false)

  const [view, setView] = useState('list')
  const [selectedTripId, setSelectedTripId] = useState(null)
  const [trips, setTrips] = useState([])
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState('')

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
            msg = 'Network error — check connection and that the API is reachable (VITE_API_BASE).'
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
    const raw = import.meta.env.VITE_API_BASE?.replace(/\/$/, '') || ''
    let url
    if (raw.startsWith('http://')) {
      url = `${raw.replace(/^http/, 'ws').replace(/\/api$/, '')}/ws/trips`
    } else if (raw.startsWith('https://')) {
      url = `${raw.replace(/^https/, 'wss').replace(/\/api$/, '')}/ws/trips`
    } else {
      const host = typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1'
      const proto = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss' : 'ws'
      url = `${proto}://${host}:8000/ws/trips`
    }
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
      try {
        const { data } = await api.post('/checkin', { qr })
        await loadTrips(false)
        return {
          variant: 'success',
          message: data?.message || 'Check-in successful',
        }
      } catch (e) {
        console.error('API ERROR:', e)
        const status = e.response?.status
        const detail = formatApiDetail(e.response?.data?.detail)
        const text = detail || 'Check-in failed'
        if (status === 400 && /already/i.test(text)) {
          return { variant: 'warn', message: text }
        }
        return { variant: 'error', message: text }
      }
    },
    [loadTrips],
  )

  const openSheet = (tripId) => {
    setSelectedTripId(tripId)
    setView('sheet')
  }

  const openScan = () => setView('scan')

  const backToList = () => {
    setSelectedTripId(null)
    setView('list')
    loadTrips(false)
  }

  const closeScan = () => {
    setView(selectedTripId != null ? 'sheet' : 'list')
    loadTrips(false)
  }

  if (driverId == null) {
    return null
  }

  return (
    <div className="app-shell">
      {loading && <LoadingScreen className={fadeOut ? 'fade-out' : ''} />}
      <div className="container">
        <header className="app-header header">
          <span className="logo">Work</span>
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
            <TripList
              trips={trips}
              loading={listLoading}
              error={listError}
              onSelect={openSheet}
              onOpenScan={openScan}
            />
          )}
          {view === 'sheet' && selectedTripId != null && (
            <ServiceSheet
              tripId={selectedTripId}
              driverId={driverId}
              onBack={backToList}
              onOpenScan={openScan}
            />
          )}
          {view === 'scan' && <QrScanner onCheckIn={handleCheckIn} onBack={closeScan} />}
        </main>
      </div>
    </div>
  )
}
