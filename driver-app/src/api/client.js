import {
  clearSession,
  getToken,
  parseJwtPayload,
} from '../auth/token.js'

import api from './axios.js'

/**
 * Session for mobile app: any valid JWT with role driver (user-based or legacy driver JWT).
 * `sub` may be user id or driver id — API resolves via `require_driver`.
 *
 * Returns a **new object** on every call — do **not** use it as a React `useEffect` dependency
 * (use `getToken()` or a value memoized with `useMemo(..., [getToken()])` instead).
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
  try {
    await api.get('/driver/me', { headers: { Accept: 'application/json' } })
  } catch (e) {
    const status = e?.response?.status
    if (status === 401 || status === 403) throw new Error('unauthorized')
    throw new Error('validation failed')
  }
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
