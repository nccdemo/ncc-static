/**
 * Single source of truth for the portal JWT in localStorage.
 * ``setToken`` always writes both keys so reads never diverge.
 */
/** Primary key (matches login response / most API docs). */
export const TOKEN_KEY = 'access_token'
/** Legacy alias kept in sync for older code or external snippets. */
const LEGACY_TOKEN_KEY = 'token'

/** Last resolved portal login role (mirrors JWT; handy for other UIs on same origin). */
export const LOGIN_ROLE_KEY = 'portal_login_role'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || localStorage.getItem(LEGACY_TOKEN_KEY)
}

export function setToken(accessToken) {
  if (!accessToken) return
  localStorage.setItem(TOKEN_KEY, accessToken)
  localStorage.setItem(LEGACY_TOKEN_KEY, accessToken)
}

/** Persist role from ``POST /api/login`` (lowercase ``admin`` | ``driver`` | ``bnb``). */
export function setLoginRole(role) {
  if (!role) return
  localStorage.setItem(LOGIN_ROLE_KEY, String(role).toLowerCase())
}

export function getLoginRole() {
  return localStorage.getItem(LOGIN_ROLE_KEY)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(LEGACY_TOKEN_KEY)
  localStorage.removeItem(LOGIN_ROLE_KEY)
  localStorage.removeItem('bnb')
}

export function parseJwtPayload(token) {
  if (!token) return null
  try {
    const part = token.split('.')[1]
    if (!part) return null
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(json)
  } catch {
    return null
  }
}

/** Normalized role from JWT: ``admin`` | ``driver`` | ``bnb`` | …, or null. */
export function getRole(token = getToken()) {
  const r = parseJwtPayload(token)?.role
  return r != null ? String(r).toLowerCase() : null
}

/**
 * Identity derived from the JWT (``user_id``, ``driver_id``, ``bnb_id`` claims when present).
 * Legacy driver tokens use ``sub`` = ``drivers.id`` and omit ``user_id``.
 */
export function getUser(token = getToken()) {
  const p = parseJwtPayload(token)
  if (!p) return null
  const role = p.role != null ? String(p.role).toLowerCase() : null
  const subNum = p.sub != null && !Number.isNaN(Number(p.sub)) ? Number(p.sub) : null
  const userId = p.user_id != null && !Number.isNaN(Number(p.user_id)) ? Number(p.user_id) : null
  let driverId =
    p.driver_id != null && !Number.isNaN(Number(p.driver_id)) ? Number(p.driver_id) : null
  if (role === 'driver' && userId == null && subNum != null) {
    driverId = driverId ?? subNum
  }
  const bnbId = p.bnb_id != null && !Number.isNaN(Number(p.bnb_id)) ? Number(p.bnb_id) : null
  return { role, userId, driverId, bnbId, sub: subNum }
}

export function getRoleFromToken(token = getToken()) {
  return getRole(token)
}
