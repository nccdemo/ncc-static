import axios from '../api/axios.js'

/** Shared axios instance (Bearer token + 401 handling). */
export const api = axios

export async function getActiveTrips() {
  try {
    const { data } = await api.get('/api/dispatch/trips/active')
    return data
  } catch (err) {
    console.error('Trips error:', err)
    throw err
  }
}

export async function getDrivers() {
  try {
    const { data } = await api.get('/api/drivers/')
    return data
  } catch (err) {
    console.error('Drivers error:', err)
    throw err
  }
}

export const assignTrip = (id, data) => api.post(`/api/dispatch/trips/${id}/assign`, data)

export const reassignTrip = (id) => api.post(`/api/dispatch/trips/${id}/reassign`)

export const cancelTrip = (id) => api.post(`/api/dispatch/trips/${id}/cancel`)

export const getAvailableDrivers = () =>
  api.get('/api/dispatch/drivers/available').catch((err) => {
    console.error('Available drivers error:', err)
    throw err
  })

export const getVehicles = () =>
  api.get('/api/vehicles/').catch((err) => {
    console.error('Vehicles error:', err)
    throw err
  })

export const getTours = () => api.get('/api/tours/')

export const createTour = (data) => api.post('/api/tours/', data)

export const updateTour = (id, data) => api.put(`/api/tours/${id}`, data)

export const deleteTour = (id) => api.delete(`/api/tours/${id}`)

export const uploadTourImage = (id, formData) =>
  api.post(`/api/tours/${id}/upload-image`, formData, {
    // upload is auth-protected; role is derived from JWT
  })
