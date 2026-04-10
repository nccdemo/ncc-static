import { getToken, redirectToLogin } from '../auth/storage.js'

async function readError(res) {
  try {
    const data = await res.json()
    if (data?.detail) {
      if (typeof data.detail === 'string') return data.detail
      if (Array.isArray(data.detail)) {
        return data.detail.map((d) => d.msg || JSON.stringify(d)).join(', ')
      }
    }
    return res.statusText || 'Request failed'
  } catch {
    return res.statusText || 'Request failed'
  }
}

export async function apiFetch(path, options = {}) {
  const token = getToken()
  console.log('TOKEN:', token)

  if (!token) {
    redirectToLogin()
    throw new Error('Sessione non valida')
  }

  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    ...options.headers,
  }
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(`/api${path}`, { ...options, headers })

  if (res.status === 401 || res.status === 403) {
    redirectToLogin()
    throw new Error('Sessione non valida')
  }

  return res
}

export async function apiJson(path, options = {}) {
  const res = await apiFetch(path, options)
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  if (res.status === 204) return null
  return res.json()
}

/** Validates JWT server-side (``users`` role admin). */
export function getAdminPing() {
  return apiJson('/auth/admin/ping')
}

export function fetchAdminBookings() {
  return apiJson('/admin/bookings')
}

export function fetchBnbPerformance() {
  return apiJson('/admin/bnb/performance')
}

export function fetchAdminBnbList() {
  return apiJson('/admin/bnb')
}

export function fetchDrivers() {
  return apiJson('/drivers/')
}

export function fetchTourInstances() {
  return apiJson('/tour-instances')
}

export function fetchTours() {
  return apiJson('/tours/')
}

export function assignDriverToInstance(instanceId, driverId) {
  return apiJson(`/tour-instances/${instanceId}/assign`, {
    method: 'PUT',
    body: JSON.stringify({ driver_id: driverId, vehicle_ids: [] }),
  })
}
