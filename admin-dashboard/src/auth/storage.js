/** Primary JWT key for admin API calls (see `api/client.js`). */
export const TOKEN_KEY = 'token'
/** Legacy key kept for one release so existing sessions still work. */
const LEGACY_TOKEN_KEY = 'ncc_partner_access_token'

export const ROLE_KEY = 'ncc_partner_role'

export const LOGIN_PATH = '/login'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || localStorage.getItem(LEGACY_TOKEN_KEY)
}

export function setToken(token) {
  if (!token) return
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.removeItem(LEGACY_TOKEN_KEY)
}

export function setRole(role) {
  if (role) localStorage.setItem(ROLE_KEY, role)
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(LEGACY_TOKEN_KEY)
  localStorage.removeItem(ROLE_KEY)
}

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

export function jwtRoleAllowed(token, allowedRoles) {
  if (!token || !Array.isArray(allowedRoles) || allowedRoles.length === 0) return false
  const role = parseJwtPayloadRole(token)
  return allowedRoles.includes(role)
}

export function redirectToLogin() {
  clearSession()
  window.location.href = '/login'
}
