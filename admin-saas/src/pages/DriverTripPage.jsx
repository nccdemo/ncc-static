import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { api } from '../lib/api.js'

function badgeClass(status) {
  if (status === 'checked_in') {
    return 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100'
  }
  return 'border-slate-400/10 bg-white/5 text-slate-200'
}

function badgeLabel(status) {
  return status === 'checked_in' ? 'Checked in' : 'Pending'
}

function tripStatusClass(status) {
  if (status === 'in_progress') {
    return 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100'
  }
  if (status === 'completed') {
    return 'border-slate-400/20 bg-slate-500/10 text-slate-200'
  }
  return 'border-amber-400/20 bg-amber-500/10 text-amber-100'
}

function tripStatusLabel(status) {
  if (status === 'in_progress') return '🟢 In Progress'
  if (status === 'completed') return '⚪ Completed'
  return '🟡 Scheduled'
}

export function DriverTripPage() {
  const { id: tourInstanceId } = useParams()
  const [tour, setTour] = useState(null)
  const [bookings, setBookings] = useState([])
  const [status, setStatus] = useState('scheduled')
  const [capacity, setCapacity] = useState(0)
  const [occupied, setOccupied] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [vehicleInfo, setVehicleInfo] = useState(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [wsConnected, setWsConnected] = useState(false)

  const wsRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)

  const canStart = useMemo(() => status === 'scheduled' && !actionLoading, [status, actionLoading])
  const canComplete = useMemo(() => status === 'in_progress' && !actionLoading, [status, actionLoading])
  const isFull = capacity > 0 && occupied >= capacity
  const sortedBookings = useMemo(() => {
    return [...bookings].sort((a, b) => {
      if (a.status === b.status) return 0
      return a.status === 'checked_in' ? -1 : 1
    })
  }, [bookings])

  const fetchData = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) {
        setError(null)
      }
      if (!tourInstanceId) {
        if (!silent) {
          setError('Missing tour instance')
          setLoading(false)
        }
        return
      }
      if (!silent) setLoading(true)
      try {
        const [instanceRes, bookingsRes, statusRes] = await Promise.all([
          api.get(`/api/tour-instances/${tourInstanceId}`),
          api.get(`/api/tour-instances/${tourInstanceId}/bookings`),
          api.get(`/api/tour-instances/${tourInstanceId}/status`),
        ])

        const inst = instanceRes.data
        setVehicleInfo(inst?.vehicle ?? null)
        setTour(
          inst?.tour_title != null
            ? { title: inst.tour_title, id: inst.tour_id }
            : inst?.tour_id != null
              ? { title: `Tour #${inst.tour_id}`, id: inst.tour_id }
              : null,
        )
        setBookings(Array.isArray(bookingsRes.data) ? bookingsRes.data : [])
        setStatus(statusRes?.data?.status ?? inst?.status ?? 'scheduled')
        setCapacity(Number(statusRes?.data?.capacity) || 0)
        setOccupied(Number(statusRes?.data?.occupied) || 0)
      } catch (e) {
        if (!silent) {
          setError(e?.response?.data?.detail ?? e?.message ?? 'Failed to load trip data')
          setTour(null)
          setVehicleInfo(null)
          setBookings([])
          setStatus('scheduled')
          setCapacity(0)
          setOccupied(0)
        }
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [tourInstanceId],
  )

  async function handleStart() {
    try {
      setActionLoading(true)
      await api.post(`/api/tour-instances/${tourInstanceId}/start`)
      await fetchData({ silent: false })
    } catch (e) {
      alert(e?.response?.data?.detail ?? e?.message ?? 'Failed to start trip')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleComplete() {
    try {
      setActionLoading(true)
      await api.post(`/api/tour-instances/${tourInstanceId}/complete`)
      await fetchData({ silent: false })
    } catch (e) {
      alert(e?.response?.data?.detail ?? e?.message ?? 'Failed to complete trip')
    } finally {
      setActionLoading(false)
    }
  }

  useEffect(() => {
    if (!tourInstanceId) return

    fetchData({ silent: false })

    const pollId = setInterval(() => {
      fetchData({ silent: true })
    }, 5000)

    let stopped = false
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const wsUrl = `${protocol}://${window.location.host}/api/ws/tour-instances/${tourInstanceId}`

    const connect = () => {
      if (stopped) return
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        setWsConnected(true)
        fetchData({ silent: true })
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)

          switch (data?.type) {
            case 'init':
              setBookings(data.bookings || [])
              setStatus(data.status || 'scheduled')
              setCapacity(Number(data.capacity) || 0)
              setOccupied(Number(data.occupied) || 0)
              break
            case 'booking_created':
              if (data.booking) {
                setBookings((prev) => [...prev, data.booking])
              }
              break
            case 'checkin':
              setBookings((prev) =>
                prev.map((b) =>
                  b.id === data.booking_id ? { ...b, status: 'checked_in' } : b,
                ),
              )
              if (data.occupied !== undefined) {
                setOccupied(Number(data.occupied) || 0)
              }
              break
            case 'status_changed':
              if (data.status) setStatus(data.status)
              break
            case 'capacity_updated':
              if (data.capacity !== undefined) {
                setCapacity(Number(data.capacity) || 0)
              }
              if (data.occupied !== undefined) {
                setOccupied(Number(data.occupied) || 0)
              }
              break
            default:
              break
          }

          // Backward-compatible fallback fields (for full-state payloads).
          if (data?.bookings) setBookings(data.bookings)
          if (data?.status) setStatus(data.status)
          if (data?.capacity !== undefined) setCapacity(Number(data.capacity) || 0)
          if (data?.occupied !== undefined) setOccupied(Number(data.occupied) || 0)
        } catch {
          // Ignore malformed ws payloads and keep current UI state.
        }
      }

      ws.onerror = () => {
        setWsConnected(false)
      }

      ws.onclose = () => {
        setWsConnected(false)
        if (stopped) return
        reconnectTimeoutRef.current = setTimeout(connect, 2000)
      }
    }

    connect()

    return () => {
      stopped = true
      clearInterval(pollId)
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
      if (wsRef.current) wsRef.current.close()
    }
  }, [tourInstanceId, fetchData])

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-100">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/70 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
          <Link to="/public/tours" className="text-sm font-semibold tracking-tight hover:text-white">
            NCC Demo
          </Link>
          <div className="text-xs sm:text-sm text-slate-300">Trip dashboard</div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-12">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-sm sm:p-8">
          {loading ? (
            <div className="py-10 text-center text-sm text-slate-300">Loading…</div>
          ) : error ? (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">
                    {tour?.title ?? `Trip #${tourInstanceId}`}
                  </h1>
                  {vehicleInfo?.name ? (
                    <p className="mt-2 text-sm font-medium text-slate-200">
                      Vehicle: {vehicleInfo.name}
                      {vehicleInfo.plate ? ` - ${vehicleInfo.plate}` : ''}
                    </p>
                  ) : null}
                  <p className="mt-1 text-sm text-slate-300">
                    Live updates via WebSocket.
                  </p>
                  <div className="mt-2 text-xs">
                    <span className={wsConnected ? 'text-emerald-300' : 'text-amber-300'}>
                      {wsConnected ? 'Live connected' : 'Live disconnected'}
                    </span>
                  </div>
                </div>

                <div className="grid w-full grid-cols-2 gap-3 sm:w-auto">
                  <div
                    className={[
                      'rounded-2xl border px-4 py-3',
                      tripStatusClass(status),
                    ].join(' ')}
                  >
                    <div className="text-xs uppercase tracking-wide opacity-90">Status</div>
                    <div className="text-lg font-semibold">{tripStatusLabel(status)}</div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
                    <div className="text-xs uppercase tracking-wide text-slate-300">Seats</div>
                    <div className={`text-2xl font-semibold ${isFull ? 'text-red-400' : 'text-white'}`}>
                      {occupied} / {capacity}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={handleStart}
                  disabled={!canStart}
                  className={[
                    'flex-1 rounded-2xl px-4 py-3 text-sm font-semibold transition',
                    canStart
                      ? 'bg-emerald-500 text-white hover:bg-emerald-400'
                      : 'cursor-not-allowed bg-emerald-900/40 text-emerald-100/60',
                  ].join(' ')}
                >
                  {actionLoading && status === 'scheduled' ? 'Starting…' : 'START'}
                </button>
                <button
                  type="button"
                  onClick={handleComplete}
                  disabled={!canComplete}
                  className={[
                    'flex-1 rounded-2xl px-4 py-3 text-sm font-semibold transition',
                    canComplete
                      ? 'bg-slate-100 text-slate-950 hover:bg-white'
                      : 'cursor-not-allowed bg-slate-800 text-slate-400',
                  ].join(' ')}
                >
                  {actionLoading && status === 'in_progress' ? 'Completing…' : 'COMPLETE'}
                </button>
              </div>

              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => fetchData({ silent: false })}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10 sm:w-auto"
                >
                  Refresh now
                </button>
              </div>

              <div className="mt-6 space-y-3">
                {bookings.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-8 text-center text-sm text-slate-300">
                    No bookings yet
                  </div>
                ) : (
                  sortedBookings.map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-950/40 p-4"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-white">
                          {b.name ?? '—'}
                        </div>
                        <div className="mt-1 text-sm text-slate-300">
                          {b.passengers ?? '—'} pax
                        </div>
                      </div>

                      <div
                        className={[
                          'shrink-0 rounded-full border px-3 py-1 text-xs font-semibold',
                          badgeClass(b.status),
                        ].join(' ')}
                      >
                        {badgeLabel(b.status)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
