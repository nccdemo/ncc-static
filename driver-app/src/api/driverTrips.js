import api from './axios.js'

/** Full trip payload for driver (pickup, destination, customer, coords). */
export async function fetchDriverTrip(tripId, driverId) {
  const { data } = await api.get(`/driver/trips/${tripId}`, {
    params: driverId != null ? { driver_id: driverId } : {},
  })
  return data
}

export async function cancelTrip(tripId) {
  const { data } = await api.post(`/driver/trips/${tripId}/cancel`)
  return data
}

export async function fetchTodayTrips() {
  const { data } = await api.get('/driver/today-trips')
  return Array.isArray(data) ? data : []
}

/**
 * @param {number} tripId
 * @param {'confirmed' | 'in_progress' | 'completed'} status
 */
export async function updateDriverTripStatus(tripId, status) {
  const { data } = await api.post(`/driver/trips/${tripId}/status`, { status })
  return data
}
