/** Same keys as partner-onboarding handoff / login. */
export const TOKEN_KEY = 'ncc_partner_access_token'
export const ROLE_KEY = 'ncc_partner_role'

// Default login entry for this app is "/".
export const LOGIN_URL = import.meta.env.VITE_LOGIN_URL || '/'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
}

export function setRole(role) {
  if (role) localStorage.setItem(ROLE_KEY, role)
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(ROLE_KEY)
}

/**
 * Import JWT from partner onboarding hash: #ncc_partner_jwt=...
 * Call once on app bootstrap.
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
  try {
    const parts = token.split('.')
    if (parts.length < 2) return ''
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64.length % 4
    if (pad) b64 += '='.repeat(4 - pad)
    const json = atob(b64)
    const payload = JSON.parse(json)
    return String(payload.role || '').toLowerCase()
  } catch {
    return ''
  }
}

/** ``allowedRoles`` must be lower-case (e.g. ``['driver']``). */
export function jwtRoleAllowed(token, allowedRoles) {
  if (!token || !Array.isArray(allowedRoles) || allowedRoles.length === 0) return false
  const role = parseJwtPayloadRole(token)
  return allowedRoles.includes(role)
}

export function jwtRoleIsDriver(token) {
  return jwtRoleAllowed(token, ['driver'])
}

export function redirectToLogin() {
  clearSession()
  window.location.href = LOGIN_URL
}
