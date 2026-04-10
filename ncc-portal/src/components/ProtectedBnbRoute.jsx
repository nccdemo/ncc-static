import { Navigate } from 'react-router-dom'

import { getRoleFromToken, getToken } from '../auth/token.js'

export default function ProtectedBnbRoute({ children }) {
  if (import.meta.env.DEV) {
    return children
  }

  const token = getToken()

  if (!token) {
    return <Navigate to="/login" replace />
  }

  const role = getRoleFromToken(token)
  // JWT: only bnb may access. Opaque tokens (no JWT payload) still allowed (e.g. temp login).
  if (role != null && role !== 'bnb') {
    return <Navigate to="/login" replace />
  }

  return children
}
