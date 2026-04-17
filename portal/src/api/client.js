import { getRole, getToken } from '../auth/token.js'

export function readAdminSession() {
  const token = getToken()
  if (!token || getRole(token) !== 'admin') return null
  return { token, role: 'admin' }
}

export {
  clearToken,
  getRole,
  getRoleFromToken,
  getUser,
  getToken,
  setToken,
} from '../auth/token.js'
