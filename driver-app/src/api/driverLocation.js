import api from './axios.js'

/**
 * POST /api/driver/location — body `{ lat, lng }`; Authorization from axios interceptor.
 */
export async function postDriverLocation(lat, lng) {
  const { data } = await api.post('/driver/location', {
    lat: Number(lat),
    lng: Number(lng),
  })
  return data
}
