import { NavLink, Outlet, useNavigate } from 'react-router-dom'

import { clearSession, LOGIN_PATH } from '../auth/storage.js'

export default function ProtectedLayout() {
  const navigate = useNavigate()

  function logout() {
    clearSession()
    navigate(LOGIN_PATH, { replace: true })
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">NCC Admin</div>
        <nav className="sidebar-nav">
          <NavLink to="/dashboard" className="sidebar-link">
            Dashboard
          </NavLink>
          <NavLink to="/bnb" className="sidebar-link">
            B&amp;B performance
          </NavLink>
          <NavLink to="/admin/bnb" className="sidebar-link">
            B&amp;B Affiliati
          </NavLink>
          <NavLink to="/drivers" className="sidebar-link">
            Autisti &amp; tour
          </NavLink>
          <NavLink to="/bookings" className="sidebar-link">
            Prenotazioni
          </NavLink>
        </nav>
        <button type="button" className="sidebar-exit sidebar-exit-btn" onClick={logout}>
          Esci
        </button>
      </aside>
      <div className="main-area">
        <Outlet />
      </div>
    </div>
  )
}
