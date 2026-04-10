import { getRoleFromToken, getToken } from '../auth/token.js'

export const API_BASE =
  import.meta.env.VITE_API_BASE?.replace(/\/$/, '') || '/api'

export function readAdminSession() {
  const token = getToken()
  if (!token || getRoleFromToken(token) !== 'admin') return null
  return { token, role: 'admin' }
}

export {
  clearToken,
  getRoleFromToken,
  getToken,
  setToken,
} from '../auth/token.js'
