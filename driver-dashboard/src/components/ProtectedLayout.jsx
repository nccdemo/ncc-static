import { NavLink, Outlet } from 'react-router-dom'

import { LOGIN_URL } from '../auth/storage.js'

/** Driver dashboard chrome only; wrap routes with ``ProtectedRoute`` for auth. */
export default function ProtectedLayout() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">NCC Driver</div>
        <nav className="sidebar-nav">
          <NavLink to="/dashboard" className="sidebar-link">
            Dashboard
          </NavLink>
          <NavLink to="/tours" className="sidebar-link">
            Tour
          </NavLink>
          <NavLink to="/tours/create" className="sidebar-link">
            Nuovo tour
          </NavLink>
          <NavLink to="/instances" className="sidebar-link">
            Date tour
          </NavLink>
          <NavLink to="/bookings" className="sidebar-link">
            Prenotazioni
          </NavLink>
        </nav>
        <a className="sidebar-exit" href={LOGIN_URL}>
          Torna al login partner
        </a>
      </aside>
      <div className="main-area">
        <Outlet />
      </div>
    </div>
  )
}
