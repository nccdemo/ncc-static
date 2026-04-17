import { clearToken, getRoleFromToken, getToken, setToken } from '../auth/token.js'

export function readAdminSession() {
  const token = getToken()
  if (!token || getRoleFromToken(token) !== 'admin') return null
  return { token, role: 'admin' }
}

export function saveAdminSession(session) {
  if (session?.token) setToken(session.token)
}

export function clearAdminSession() {
  clearToken()
}
