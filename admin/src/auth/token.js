/** Canonical JWT storage key for admin + driver (see ncc-portal). */
export const TOKEN_KEY = 'token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(accessToken) {
  localStorage.setItem(TOKEN_KEY, accessToken)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
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
