import {
  clearSession,
  getToken,
  parseJwtPayload,
} from '../auth/token.js'

export const API_BASE =
  import.meta.env.VITE_API_BASE?.replace(/\/$/, '') || '/api'

/**
 * Session for mobile app: any valid JWT with role driver (user-based or legacy driver JWT).
 * `sub` may be user id or driver id — API resolves via `require_driver`.
 */
export function readDriverSession() {
  const token = getToken()
  if (!token) return null
  const role = String(parseJwtPayload(token)?.role || '').toLowerCase()
  if (role !== 'driver') return null
  return {
    token,
    role: 'driver',
  }
}

export function saveDriverSession() {
  /* token is set via setToken */
}

export function clearDriverSession() {
  clearSession()
}

/** Server-side check after JWT role gate (same as driver dashboard ``getDriverMe``). */
export async function validateDriverSessionApi() {
  const token = getToken()
  if (!token) throw new Error('no token')
  const res = await fetch(`${API_BASE}/driver/me`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  })
  if (res.status === 401 || res.status === 403) throw new Error('unauthorized')
  if (!res.ok) throw new Error('validation failed')
}

export function formatApiDetail(detail) {
  if (detail == null) return 'Request failed'
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    const first = detail[0]
    if (first && typeof first === 'object' && first.msg) return String(first.msg)
    return JSON.stringify(detail)
  }
  if (typeof detail === 'object' && detail.msg) return String(detail.msg)
  return String(detail)
}
