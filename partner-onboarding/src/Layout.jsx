import { Link, NavLink, useNavigate } from 'react-router-dom'
import { clearAuth, getStoredToken } from './session'

export default function Layout({ children }) {
  const navigate = useNavigate()
  const hasToken = Boolean(getStoredToken())

  function handleLogout() {
    clearAuth()
    navigate('/')
  }

  return (
    <div className="layout">
      <header className="nav">
        <div className="nav-inner">
          <Link to="/" className="nav-brand">
            NCC Partner
          </Link>
          <nav className="nav-links" aria-label="Principale">
            <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : undefined)}>
              Home
            </NavLink>
            <NavLink to="/driver" className={({ isActive }) => (isActive ? 'active' : undefined)}>
              Autisti
            </NavLink>
            <NavLink to="/bnb" className={({ isActive }) => (isActive ? 'active' : undefined)}>
              B&amp;B
            </NavLink>
            <NavLink to="/login" className={({ isActive }) => (isActive ? 'active' : undefined)}>
              Accedi
            </NavLink>
          </nav>
          <div className="nav-cta">
            {hasToken ? (
              <button type="button" className="btn btn-ghost" onClick={handleLogout}>
                Esci
              </button>
            ) : null}
            <Link to="/register-driver" className="btn btn-driver">
              Registrati autista
            </Link>
            <Link to="/register-bnb" className="btn btn-bnb">
              Registrati B&amp;B
            </Link>
          </div>
        </div>
      </header>
      <main className="layout-main">{children}</main>
    </div>
  )
}
