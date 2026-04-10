import { Navigate } from 'react-router-dom'

import { getRoleFromToken, getToken } from '../auth/token.js'

export default function ProtectedRoute({ children }) {
  const token = getToken()

  if (!token) {
    return <Navigate to="/driver/login" replace />
  }

  if (getRoleFromToken(token) !== 'driver') {
    return <Navigate to="/driver/login" replace />
  }

  return children
}
