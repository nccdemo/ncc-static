import { useCallback, useEffect, useMemo, useState } from 'react'
import { Layout } from '../components/Layout.jsx'
import { Sidebar } from '../components/Sidebar.jsx'
import { TripsPanel } from '../components/TripsPanel.jsx'
import { DriversPanel } from '../components/DriversPanel.jsx'
import { MapView } from '../components/MapView.jsx'
import { api } from '../lib/api.js'
import { useWebSocketTrips } from '../hooks/useWebSocketTrips.js'

function mergeTripLive(trips, live) {
  return trips.map((t) => {
    if (String(t.id) !== String(live.trip_id)) return t
    const next = { ...t }
    if (live.status) next.status = live.status
    if (typeof live.eta_to_pickup_minutes !== 'undefined') {
      next.eta_to_pickup_minutes = live.eta_to_pickup_minutes
    }
    return next
  })
}

function mergeDriverLocation(drivers, evt) {
  return drivers.map((d) => {
    if (String(d.id) !== String(evt.driver_id)) return d
    return { ...d, latitude: evt.lat, longitude: evt.lng }
  })
}

export function Dashboard() {
  const [trips, setTrips] = useState([])
  const [drivers, setDrivers] = useState([])
  const [selectedTripId, setSelectedTripId] = useState(null)
  const selectedTrip = useMemo(
    () => trips.find((t) => String(t.id) === String(selectedTripId)) || null,
    [trips, selectedTripId],
  )

  const loadTrips = useCallback(async () => {
    const { data } = await api.get('/dispatch/trips/active')
    setTrips(data)
    if (data.length && selectedTripId == null) setSelectedTripId(data[0].id)
  }, [selectedTripId])

  const loadDrivers = useCallback(async () => {
    const { data } = await api.get('/drivers/')
    setDrivers(data)
  }, [])

  useEffect(() => {
    loadTrips()
    loadDrivers()
    const interval = setInterval(() => {
      loadTrips()
      loadDrivers()
    }, 15000)
    return () => clearInterval(interval)
  }, [loadTrips, loadDrivers])

  useWebSocketTrips({
    onEvent: (evt) => {
      if (!evt?.event) return
      if (evt.event === 'trip_updated') {
        loadTrips()
        return
      }
      if (evt.event === 'trip_live_update') {
        setTrips((prev) => mergeTripLive(prev, evt))
        return
      }
      if (evt.event === 'driver_location_update') {
        setDrivers((prev) => mergeDriverLocation(prev, evt))
      }
    },
  })

  return (
    <Layout sidebar={<Sidebar />}>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-3">
        <section className="dashboard-content flex min-h-0 flex-col xl:col-span-2">
          <div className="top-cards shrink-0 space-y-4">
            <TripsPanel
              trips={trips}
              selectedTripId={selectedTripId}
              onSelect={(t) => setSelectedTripId(t.id)}
            />
          </div>
          <div className="map-section mt-4 min-h-0 flex-1">
            <div className="map-container h-full min-h-0">
              <MapView drivers={drivers} trips={trips} selectedTripId={selectedTripId} />
            </div>
          </div>
        </section>
        <section className="shrink-0 xl:min-h-0">
          <DriversPanel drivers={drivers} />
        </section>
      </div>
    </Layout>
  )
}

export default Dashboard

