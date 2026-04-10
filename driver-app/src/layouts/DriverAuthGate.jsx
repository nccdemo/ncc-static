import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { readDriverSession } from '../lib/api'

export default function DriverAuthGate({ loginPath = '/' }) {
  const location = useLocation()
  if (!readDriverSession()?.driver?.id) {
    return <Navigate to={loginPath} replace state={{ from: location.pathname }} />
  }
  return <Outlet />
}
