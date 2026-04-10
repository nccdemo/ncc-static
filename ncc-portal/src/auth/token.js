/**
 * Single source of truth for the portal JWT in localStorage.
 * ``setToken`` always writes both keys so reads never diverge.
 */
/** Primary key (matches login response / most API docs). */
export const TOKEN_KEY = 'access_token'
/** Legacy alias kept in sync for older code or external snippets. */
const LEGACY_TOKEN_KEY = 'token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || localStorage.getItem(LEGACY_TOKEN_KEY)
}

export function setToken(accessToken) {
  if (!accessToken) return
  localStorage.setItem(TOKEN_KEY, accessToken)
  localStorage.setItem(LEGACY_TOKEN_KEY, accessToken)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(LEGACY_TOKEN_KEY)
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

export function getRoleFromToken(token = getToken()) {
  return parseJwtPayload(token)?.role ?? null
}
