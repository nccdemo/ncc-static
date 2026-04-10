import { useCallback, useEffect, useState } from 'react'

import { api, cancelTrip, getActiveTrips, getAvailableDrivers, getVehicles, reassignTrip } from '../lib/api.js'
import { Button } from '../components/ui/button.jsx'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.jsx'
import { AssignControls, resolveDriverId, resolveVehicleId } from './AssignControls.jsx'
import { TripCard } from './TripCard.jsx'

function mapTripFromApi(trip) {
  return {
    id: trip.id,
    status: String(trip.status || '').toUpperCase(),
    driver: trip.driver ?? null,
    vehicle: trip.vehicle ?? null,
    pickup: trip.pickup || '—',
    destination: trip.destination || '—',
    customer: trip.bookings?.[0]?.customer_name || '—',
    eta:
      trip.eta_to_pickup_minutes != null && Number.isFinite(Number(trip.eta_to_pickup_minutes))
        ? Math.round(Number(trip.eta_to_pickup_minutes))
        : null,
    start_km:
      trip.start_km != null && Number.isFinite(Number(trip.start_km)) ? Number(trip.start_km) : null,
    end_km: trip.end_km != null && Number.isFinite(Number(trip.end_km)) ? Number(trip.end_km) : null,
    service_start_time: trip.service_start_time || null,
    service_end_time: trip.service_end_time || null,
    eta_to_pickup_minutes:
      trip.eta_to_pickup_minutes != null && Number.isFinite(Number(trip.eta_to_pickup_minutes))
        ? Math.round(Number(trip.eta_to_pickup_minutes))
        : null,
    raw: trip,
  }
}

function mapTripsFromApi(data) {
  return (Array.isArray(data) ? data : []).map(mapTripFromApi)
}

function mergeTrip(prevTrip, patch) {
  if (!prevTrip) return patch
  const next = { ...prevTrip }
  if (patch.status) next.status = String(patch.status).toUpperCase()
  if (typeof patch.eta_to_pickup_minutes !== 'undefined') {
    next.eta_to_pickup_minutes = patch.eta_to_pickup_minutes
  }
  if (patch.driver && typeof patch.driver === 'object') {
    next.driver = { ...(prevTrip.driver ?? {}), ...patch.driver }
  }
  if (patch.vehicle && typeof patch.vehicle === 'object') {
    next.vehicle = { ...(prevTrip.vehicle ?? {}), ...patch.vehicle }
  }
  if (patch.pickup_lat != null) next.pickup_lat = patch.pickup_lat
  if (patch.pickup_lng != null) next.pickup_lng = patch.pickup_lng
  if (patch.dropoff_lat != null) next.dropoff_lat = patch.dropoff_lat
  if (patch.dropoff_lng != null) next.dropoff_lng = patch.dropoff_lng
  if (typeof patch.driver_id !== 'undefined' || typeof patch.vehicle_id !== 'undefined') {
    next.raw = { ...(prevTrip.raw ?? {}) }
    if (typeof patch.driver_id !== 'undefined') next.raw.driver_id = patch.driver_id
    if (typeof patch.vehicle_id !== 'undefined') next.raw.vehicle_id = patch.vehicle_id
  }
  return next
}

export function TripsPage() {
  const [bootStatus, setBootStatus] = useState('loading')
  const [bootError, setBootError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  const [trips, setTrips] = useState([])
  const [drivers, setDrivers] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [assignState, setAssignState] = useState({})

  const [actionLoadingId, setActionLoadingId] = useState(null)
  const [notice, setNotice] = useState(null)

  const setSuccess = useCallback((msg) => {
    setNotice({ type: 'success', message: msg })
    setTimeout(() => setNotice(null), 2500)
  }, [])

  const setFailure = useCallback((msg) => {
    setNotice({ type: 'error', message: msg })
    setTimeout(() => setNotice(null), 3500)
  }, [])

  const refreshTrips = useCallback(async () => {
    try {
      const data = await getActiveTrips()
      setTrips(mapTripsFromApi(data))
    } catch (e) {
      console.warn('refreshTrips failed', e)
    }
  }, [])

  const loadDashboard = useCallback(
    async (mode = 'initial') => {
      if (mode === 'initial') {
        setBootStatus('loading')
        setBootError(null)
      } else {
        setRefreshing(true)
      }
      try {
        const [tripsData, driversRes, vehiclesRes] = await Promise.all([
          getActiveTrips(),
          getAvailableDrivers(),
          getVehicles(),
        ])
        setTrips(mapTripsFromApi(tripsData))
        setDrivers(Array.isArray(driversRes?.data) ? driversRes.data : [])
        setVehicles(Array.isArray(vehiclesRes?.data) ? vehiclesRes.data : [])
        if (mode === 'initial') setBootStatus('ready')
      } catch (e) {
        const msg = e?.response?.data?.detail ?? e?.message ?? 'Load failed'
        if (mode === 'initial') {
          setBootStatus('error')
          setBootError(String(msg))
        } else {
          setFailure(String(msg))
        }
      } finally {
        if (mode !== 'initial') setRefreshing(false)
      }
    },
    [setFailure],
  )

  useEffect(() => {
    loadDashboard('initial')
  }, [loadDashboard])

  useEffect(() => {
    if (bootStatus !== 'ready') return

    const wsTrips = new WebSocket('ws://127.0.0.1:8000/ws/trips')
    const wsDrivers = new WebSocket('ws://127.0.0.1:8000/ws/drivers')

    wsTrips.onopen = () => {
      console.log('WS trips connected')
    }

    wsTrips.onmessage = (event) => {
      try {
        JSON.parse(event.data)
        void refreshTrips()
      } catch (err) {
        console.error('WS trips parse error:', err)
      }
    }

    wsTrips.onerror = () => {}

    wsTrips.onclose = (event) => {
      if (!event.wasClean) {
        console.log('WS trips reconnecting…')
      }
    }

    wsDrivers.onopen = () => {
      console.log('WS drivers connected')
    }

    wsDrivers.onmessage = (event) => {
      try {
        JSON.parse(event.data)
      } catch (err) {
        console.error('WS drivers parse error:', err)
      }
    }

    wsDrivers.onerror = () => {}

    wsDrivers.onclose = (event) => {
      if (!event.wasClean) {
        console.log('WS drivers reconnecting…')
      }
    }

    return () => {
      wsTrips.close()
      wsDrivers.close()
    }
  }, [bootStatus, refreshTrips])

  useEffect(() => {
    if (bootStatus !== 'ready') return
    const interval = setInterval(() => {
      void refreshTrips()
    }, 30000)
    return () => clearInterval(interval)
  }, [bootStatus, refreshTrips])

  const handleAssign = useCallback(
    async (tripId) => {
      const trip = trips.find((t) => String(t.id) === String(tripId))
      if (!trip) return

      const driverId = resolveDriverId(trip, assignState)
      const vehicleId = resolveVehicleId(trip, assignState)
      if (!driverId) {
        setFailure('Select a driver')
        return
      }

      const driver = drivers.find((d) => String(d.id) === String(driverId))
      const vehicle = vehicleId ? vehicles.find((v) => String(v.id) === String(vehicleId)) : null

      const previousTrip = trip
      const optimistic = {
        ...trip,
        status: 'ASSIGNED',
        driver: driver ? { id: driver.id, name: driver.name } : trip.driver,
        vehicle: vehicle ? { id: vehicle.id, name: vehicle.name } : trip.vehicle,
        raw: {
          ...trip.raw,
          driver_id: Number(driverId),
          vehicle_id: vehicleId ? Number(vehicleId) : trip.raw?.vehicle_id ?? null,
        },
      }

      setActionLoadingId(tripId)
      setNotice(null)

      setTrips((prev) =>
        prev.map((t) => (String(t.id) === String(tripId) ? optimistic : t)),
      )
      setAssignState((prev) => {
        const next = { ...prev }
        delete next[tripId]
        return next
      })

      try {
        await api.post(`/api/dispatch/trips/${tripId}/assign`, {
          driver_id: Number(driverId),
          vehicle_id: vehicleId ? Number(vehicleId) : null,
        })
        setSuccess('Trip assigned')
      } catch (err) {
        console.error('ASSIGN ERROR', err?.response?.data || err)
        setTrips((prev) =>
          prev.map((t) => (String(t.id) === String(tripId) ? previousTrip : t)),
        )
        setFailure(err?.response?.data?.detail ?? err?.message ?? 'Errore assign')
        void refreshTrips()
      } finally {
        setActionLoadingId(null)
      }
    },
    [assignState, drivers, refreshTrips, setFailure, setSuccess, trips, vehicles],
  )

  const handleUpdateKm = useCallback(
    async (tripId, payload) => {
      const trip = trips.find((t) => String(t.id) === String(tripId))
      if (!trip) return

      const nextStart = payload?.start_km ?? null
      const nextEnd = payload?.end_km ?? null
      if (trip.start_km === nextStart && trip.end_km === nextEnd) return

      setActionLoadingId(tripId)
      setNotice(null)
      try {
        await api.put(`/api/dispatch/trips/${tripId}`, {
          start_km: nextStart,
          end_km: nextEnd,
        })

        setTrips((prev) =>
          prev.map((t) =>
            String(t.id) === String(tripId)
              ? {
                  ...t,
                  start_km: nextStart,
                  end_km: nextEnd,
                  raw: { ...(t.raw ?? {}), start_km: nextStart, end_km: nextEnd },
                }
              : t,
          ),
        )

        setAssignState((prev) => {
          const row = prev?.[tripId]
          if (!row) return prev
          const next = { ...prev }
          const cleaned = { ...row }
          delete cleaned.start_km
          delete cleaned.end_km
          if (Object.keys(cleaned).length === 0) delete next[tripId]
          else next[tripId] = cleaned
          return next
        })
      } catch (e) {
        setFailure(e?.response?.data?.detail ?? e?.message ?? 'Errore aggiornamento KM')
      } finally {
        setActionLoadingId(null)
      }
    },
    [setFailure, trips],
  )

  const handleStartService = useCallback(
    async (tripId) => {
      if (actionLoadingId != null && String(actionLoadingId) === String(tripId)) return
      const now = new Date().toISOString()
      setActionLoadingId(tripId)
      setNotice(null)
      try {
        await api.put(`/api/dispatch/trips/${tripId}`, { service_start_time: now })
        setTrips((prev) =>
          prev.map((t) =>
            String(t.id) === String(tripId)
              ? {
                  ...t,
                  service_start_time: now,
                  raw: { ...(t.raw ?? {}), service_start_time: now },
                }
              : t,
          ),
        )
      } catch (e) {
        setFailure(e?.response?.data?.detail ?? e?.message ?? 'Errore avvio servizio')
      } finally {
        setActionLoadingId(null)
      }
    },
    [actionLoadingId, setFailure],
  )

  const handleEndService = useCallback(
    async (tripId) => {
      if (actionLoadingId != null && String(actionLoadingId) === String(tripId)) return
      const now = new Date().toISOString()
      setActionLoadingId(tripId)
      setNotice(null)
      try {
        await api.put(`/api/dispatch/trips/${tripId}`, { service_end_time: now })
        setTrips((prev) =>
          prev.map((t) =>
            String(t.id) === String(tripId)
              ? {
                  ...t,
                  service_end_time: now,
                  raw: { ...(t.raw ?? {}), service_end_time: now },
                }
              : t,
          ),
        )
      } catch (e) {
        setFailure(e?.response?.data?.detail ?? e?.message ?? 'Errore fine servizio')
      } finally {
        setActionLoadingId(null)
      }
    },
    [actionLoadingId, setFailure],
  )

  const onReassign = useCallback(
    async (id) => {
      setActionLoadingId(id)
      setNotice(null)
      try {
        const res = await reassignTrip(id)
        setSuccess('Trip reassigned')
        const updated = res?.data
        if (updated?.status === 'CANCELLED') {
          setTrips((prev) => prev.filter((t) => String(t.id) !== String(id)))
        } else if (updated) {
          setTrips((prev) =>
            prev.map((t) => (String(t.id) === String(id) ? mergeTrip(t, updated) : t)),
          )
        }
      } catch (e) {
        setFailure(e?.response?.data?.detail ?? e?.message ?? 'Errore reassign')
      } finally {
        setActionLoadingId(null)
      }
    },
    [setFailure, setSuccess],
  )

  const onCancel = useCallback(
    async (id) => {
      setActionLoadingId(id)
      setNotice(null)
      try {
        await cancelTrip(id)
        setSuccess('Trip cancelled')
        setTrips((prev) => prev.filter((t) => String(t.id) !== String(id)))
      } catch (e) {
        setFailure(e?.response?.data?.detail ?? e?.message ?? 'Errore cancel')
      } finally {
        setActionLoadingId(null)
      }
    },
    [setFailure, setSuccess],
  )

  const handleCancel = useCallback(
    (tripId) => {
      if (!window.confirm(`Cancel trip #${tripId}? This will set status to CANCELLED.`)) return
      void onCancel(tripId)
    },
    [onCancel],
  )

  if (bootStatus === 'loading') {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 px-4">
        <div className="text-lg font-semibold tracking-tight">Loading dispatch…</div>
        <div className="text-sm text-muted-foreground text-center max-w-sm">
          Syncing active trips, available drivers, and vehicles
        </div>
      </div>
    )
  }

  if (bootStatus === 'error') {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 px-4">
        <div className="text-lg font-semibold text-red-300">Could not load dashboard</div>
        <p className="text-sm text-muted-foreground text-center max-w-md">{bootError}</p>
        <Button onClick={() => loadDashboard('initial')}>Retry</Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-2xl font-semibold tracking-tight">Trips</div>
          <div className="text-sm text-muted-foreground">
            Dati reali da API:{' '}
            <span className="font-mono">GET /api/dispatch/trips/active</span>
            {' · '}
            drivers &amp; vehicles caricati insieme
          </div>
        </div>
        <Button variant="outline" onClick={() => loadDashboard('refresh')} disabled={refreshing}>
          {refreshing ? 'Aggiorno…' : 'Aggiorna'}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Active trips</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {notice ? (
            <div
              className={[
                'text-sm rounded-md border px-3 py-2',
                notice.type === 'success'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                  : 'border-red-500/30 bg-red-500/10 text-red-200',
              ].join(' ')}
            >
              {notice.message}
            </div>
          ) : null}

          {trips.length === 0 ? (
            <div className="text-sm text-muted-foreground px-4 pb-2">No trips</div>
          ) : null}

          <div className="p-4 pt-0 grid gap-4 sm:grid-cols-1 xl:grid-cols-2">
            {trips.map((trip) => (
              <TripCard key={trip.id} trip={trip}>
                <AssignControls
                  trip={trip}
                  drivers={drivers}
                  vehicles={vehicles}
                  assignState={assignState}
                  setAssignState={setAssignState}
                  onAssign={handleAssign}
                  onUpdateKm={handleUpdateKm}
                  onStartService={handleStartService}
                  onEndService={handleEndService}
                  onReassign={onReassign}
                  onCancel={handleCancel}
                  actionLoadingId={actionLoadingId}
                  controlsDisabled={refreshing}
                />
              </TripCard>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
