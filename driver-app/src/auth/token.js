/**
 * Token lookup order: some builds use ``driver_session``; partner onboarding and legacy use the others.
 */
const KEYS = ['driver_session', 'ncc_partner_access_token', 'token']

/** App-local login path (driver app on 5174). */
export const PARTNER_LOGIN_URL = import.meta.env.VITE_PARTNER_LOGIN_URL || '/login'

export const LOGIN_URL = PARTNER_LOGIN_URL

/** Optional: partner onboarding app origin (JWT handoff); not used for auth redirects. */
export const PARTNER_ONBOARDING_URL =
  (import.meta.env.VITE_PARTNER_ONBOARDING_URL || '').replace(/\/$/, '') || ''

const ROLE_KEY = 'ncc_partner_role'

export function setRole(role) {
  if (role) localStorage.setItem(ROLE_KEY, role)
}

export function clearSession() {
  clearToken()
  localStorage.removeItem(ROLE_KEY)
}

/**
 * Import JWT from partner onboarding hash: #ncc_partner_jwt=...
 */
export function consumeHandoffFromHash() {
  const h = window.location.hash
  if (!h || !h.includes('ncc_partner_jwt=')) return
  try {
    const params = new URLSearchParams(h.replace(/^#/, ''))
    const jwt = params.get('ncc_partner_jwt')
    if (jwt) {
      setToken(decodeURIComponent(jwt))
      const role = parseJwtPayloadRole(jwt)
      if (role) setRole(role)
    }
  } catch {
    /* ignore */
  }
  window.history.replaceState(null, '', window.location.pathname + window.location.search)
}

export function parseJwtPayloadRole(token) {
  const p = parseJwtPayload(token)
  return String(p?.role || '').toLowerCase()
}

/** ``allowedRoles`` must be lower-case (e.g. ``['driver']``). */
export function jwtRoleAllowed(token, allowedRoles) {
  if (!token || !Array.isArray(allowedRoles) || allowedRoles.length === 0) return false
  return allowedRoles.includes(parseJwtPayloadRole(token))
}

export function redirectToLogin() {
  clearSession()
  window.location.href = '/login'
}

export function getToken() {
  for (const k of KEYS) {
    const t = localStorage.getItem(k)
    if (t) return t
  }
  return null
}

export function setToken(accessToken) {
  localStorage.setItem('driver_session', accessToken)
  localStorage.setItem('ncc_partner_access_token', accessToken)
  localStorage.setItem('token', accessToken)
}

export function clearToken() {
  for (const k of KEYS) {
    localStorage.removeItem(k)
  }
}

export function parseJwtPayload(token) {
  if (!token) return null
  try {
    const part = token.split('.')[1]
    if (!part) return null
    let b64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64.length % 4
    if (pad) b64 += '='.repeat(4 - pad)
    const json = atob(b64)
    return JSON.parse(json)
  } catch {
    return null
  }
}
