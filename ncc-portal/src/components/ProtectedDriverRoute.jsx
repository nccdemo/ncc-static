import { Navigate } from 'react-router-dom'

import { getRoleFromToken, getToken } from '../auth/token.js'

export default function ProtectedDriverRoute({ children }) {
  const token = getToken()
  if (!token) {
    return <Navigate to="/login" replace />
  }
  if (getRoleFromToken(token) !== 'driver') {
    return <Navigate to="/login" replace />
  }
  return children
}
