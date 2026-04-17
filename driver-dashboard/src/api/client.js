import { getToken, redirectToLogin, setRole, setToken } from '../auth/storage.js'

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
  const headers = {
    Accept: 'application/json',
    ...options.headers,
  }
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
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

export function getDriverMe() {
  return apiJson('/driver/me')
}

export async function loginDriver(body) {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = typeof data?.detail === 'string' ? data.detail : res.statusText || 'Login failed'
    throw new Error(msg)
  }
  const token = data?.access_token || data?.token || ''
  if (!token) throw new Error('Invalid login response')
  setToken(token)
  if (data?.role) setRole(String(data.role).toLowerCase())
  return data
}

export function getMyTours() {
  return apiJson('/driver/tours')
}

export function createTour(body) {
  return apiJson('/driver/tours', { method: 'POST', body: JSON.stringify(body) })
}

export function getMyInstances() {
  return apiJson('/driver/tour-instances')
}

export function createInstance(body) {
  return apiJson('/driver/tour-instances', { method: 'POST', body: JSON.stringify(body) })
}

export function getMyBookings() {
  return apiJson('/driver/bookings')
}
