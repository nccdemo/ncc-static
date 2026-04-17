import { Navigate, useLocation } from 'react-router-dom'

import { getRole, getToken } from '../auth/token.js'

function isLoginPath(pathname) {
  return pathname === '/login' || pathname.startsWith('/login/')
}

/**
 * Guards children using the JWT in localStorage: missing token, missing role claim, or wrong role
 * → redirect to ``/login`` (no cross-role redirects).
 *
 * If ``/login`` is ever wrapped by this guard by mistake, renders ``children`` so the login form
 * is never blocked (avoids redirect loops and endless “checking access” states).
 *
 * @param {{ role: string | string[], children: import('react').ReactNode }} props
 */
export default function RequireRole({ role, children }) {
  const location = useLocation()
  const token = getToken()

  if (isLoginPath(location.pathname)) {
    return children
  }

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  const current = getRole(token)
  const allowed = (Array.isArray(role) ? role : [role]).map((r) => String(r).toLowerCase())

  if (current != null && allowed.includes(current)) {
    return children
  }

  return <Navigate to="/login" replace state={{ from: location.pathname }} />
}
