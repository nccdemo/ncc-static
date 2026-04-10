import { useCallback, useEffect, useState } from 'react'

import { getActiveTrips, getDrivers } from '../lib/api.js'
import { MapView } from '../components/MapView.jsx'
import { Badge } from '../components/ui/badge.jsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.jsx'

function statusBadgeClass(status) {
  const s = String(status || '').toUpperCase()
  if (s === 'PENDING') return 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30'
  if (s === 'ASSIGNED') return 'bg-blue-500/15 text-blue-300 border-blue-500/30'
  if (s === 'EN_ROUTE') return 'bg-purple-500/15 text-purple-300 border-purple-500/30'
  if (s === 'ARRIVED') return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
  if (s === 'IN_PROGRESS') return 'bg-emerald-700/20 text-emerald-200 border-emerald-700/40'
  if (s === 'COMPLETED') return 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30'
  return 'bg-zinc-500/10 text-zinc-300 border-zinc-500/20'
}

function statusSortRank(status) {
  const s = String(status || '').toUpperCase()
  if (s === 'IN_PROGRESS') return 0
  if (s === 'ARRIVED') return 1
  if (s === 'EN_ROUTE') return 2
  if (s === 'ASSIGNED') return 3
  if (s === 'PENDING') return 4
  if (s === 'SCHEDULED') return 5
  if (s === 'COMPLETED') return 99
  return 50
}

export function DashboardPage() {
  const [trips, setTrips] = useState([])
  const [mapDrivers, setMapDrivers] = useState([])
  const [loading, setLoading] = useState(false)

  const loadTrips = useCallback(async (silent = false) => {
    const token = localStorage.getItem('token')
    if (!token) return
    if (!silent) setLoading(true)
    try {
      const data = await getActiveTrips()
      console.log('DISPATCH TRIPS:', data)
      const mappedTrips = (Array.isArray(data) ? data : []).map((trip) => ({
        id: trip.id,
        status: String(trip.status || '').toUpperCase(),
        driver: trip.driver?.name || '—',
        vehicle: trip.vehicle?.name || '—',
        pickup: trip.pickup || '—',
        destination: trip.destination || '—',
        customer: trip.bookings?.[0]?.customer_name || '—',
        eta_to_pickup_minutes:
          typeof trip.eta_to_pickup_minutes === 'number' ? trip.eta_to_pickup_minutes : null,
        raw: trip,
      }))
      setTrips(mappedTrips)
    } catch (e) {
      console.error(e)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  const fetchDrivers = useCallback(async () => {
    const token = localStorage.getItem('token')
    if (!token) return
    try {
      const data = await getDrivers()
      const normalized = (Array.isArray(data) ? data : []).map((d) => ({
        ...d,
        latitude: d?.latitude ?? d?.lat ?? null,
        longitude: d?.longitude ?? d?.lng ?? null,
      }))
      setMapDrivers(normalized)
    } catch (e) {
      console.error(e)
    }
  }, [])

  useEffect(() => {
    loadTrips(false)
    fetchDrivers()
  }, [fetchDrivers, loadTrips])

  useEffect(() => {
    const id = setInterval(() => {
      loadTrips(true)
    }, 30000)
    return () => clearInterval(id)
  }, [loadTrips])

  useEffect(() => {
    const wsTrips = new WebSocket('ws://127.0.0.1:8000/ws/trips')
    const wsDrivers = new WebSocket('ws://127.0.0.1:8000/ws/drivers')

    wsTrips.onopen = () => {
      console.log('WS trips connected')
    }

    wsTrips.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        console.log('TRIPS WS:', data)
        loadTrips(false)
      } catch (err) {
        console.error('WS trips parse error:', err)
      }
    }

    wsTrips.onerror = () => {
      // ignore harmless dev websocket errors
    }

    wsTrips.onclose = (event) => {
      if (!event.wasClean) {
        console.log('WS reconnecting...')
      }
    }

    wsDrivers.onopen = () => {
      console.log('WS drivers connected')
    }

    wsDrivers.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        console.log('DRIVERS WS:', data)
      } catch (err) {
        console.error('WS drivers parse error:', err)
      }
    }

    wsDrivers.onerror = () => {
      // ignore harmless dev websocket errors
    }

    wsDrivers.onclose = (event) => {
      if (!event.wasClean) {
        console.log('WS reconnecting...')
      }
    }

    return () => {
      wsTrips.close()
      wsDrivers.close()
    }
  }, [])

  return (
    <div className="dashboard-content">
      <div className="top-cards space-y-6">
        <div>
          <div className="text-2xl font-semibold tracking-tight">Dashboard</div>
          <div className="text-sm text-muted-foreground">Vista generale operativa</div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Trips attivi</CardTitle>
              <CardDescription>Da API: `GET /api/dispatch/trips/active`</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <div className="text-4xl font-semibold tracking-tight">{loading ? '…' : trips.length}</div>
              <Badge>Live</Badge>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Drivers disponibili</CardTitle>
              <CardDescription>Da API: `GET /api/drivers/`</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <div className="text-4xl font-semibold tracking-tight">{loading ? '…' : mapDrivers.length}</div>
              <Badge variant="outline">Realtime</Badge>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Veicoli attivi</CardTitle>
              <CardDescription>Da API: `GET /api/vehicles/`</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <div className="text-4xl font-semibold tracking-tight">—</div>
              <Badge variant="secondary">Fleet</Badge>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Live trips</CardTitle>
          <CardDescription>Customer • Route • Driver • ETA</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {(trips ?? [])
            .slice()
            .sort((a, b) => {
              const rank = statusSortRank(a.status) - statusSortRank(b.status)
              if (rank !== 0) return rank
              return Number(b.id) - Number(a.id)
            })
            .map((t) => (
              <div
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-card px-4 py-3 transition-colors hover:bg-muted/30"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={[
                      'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold tracking-wide',
                      statusBadgeClass(t.status),
                    ].join(' ')}
                  >
                    {t.status}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">
                      {t.customer}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {t.pickup} → {t.destination}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Driver</div>
                    <div className="text-sm font-medium">{t.driver}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">ETA</div>
                    <div className="text-sm font-medium">
                      {typeof t.eta_to_pickup_minutes === 'number' ? `${t.eta_to_pickup_minutes} min` : '—'}
                    </div>
                  </div>
                </div>
              </div>
            ))}

          {trips.length === 0 && !loading ? (
            <div className="text-sm text-muted-foreground">No trips</div>
          ) : null}
        </CardContent>
      </Card>

      <div className="map-section">
        <div className="map-container">
          <MapView drivers={mapDrivers} trips={trips} />
        </div>
      </div>
    </div>
  )
}

