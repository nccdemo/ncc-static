import { NavLink, Outlet, useNavigate } from 'react-router-dom'

import { clearSession } from '../auth/storage.js'

/** B&amp;B dashboard chrome only; wrap routes with ``ProtectedRoute`` for auth. */
export default function ProtectedLayout() {
  const navigate = useNavigate()

  function exitToLogin() {
    clearSession()
    navigate('/login', { replace: true })
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">NCC B&amp;B</div>
        <nav className="sidebar-nav">
          <NavLink to="/dashboard" className="sidebar-link">
            Dashboard
          </NavLink>
          <NavLink to="/referrals" className="sidebar-link">
            Referral
          </NavLink>
          <NavLink to="/earnings" className="sidebar-link">
            Guadagni
          </NavLink>
        </nav>
        <button type="button" className="sidebar-exit" onClick={exitToLogin}>
          Torna al login
        </button>
      </aside>
      <div className="main-area">
        <Outlet />
      </div>
    </div>
  )
}
