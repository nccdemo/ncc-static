import { NavLink, useNavigate } from 'react-router-dom'

import { clearToken } from '../auth/token.js'
import './PortalNav.css'

const linkClass = ({ isActive }) =>
  `portal-nav__link${isActive ? ' portal-nav__link--active' : ''}`

export default function PortalNav() {
  const navigate = useNavigate()

  function handleLogout() {
    clearToken()
    navigate('/login', { replace: true })
  }

  return (
    <header className="portal-nav">
      <NavLink to="/driver/dashboard" className="portal-nav__brand" end>
        NCC Portal
      </NavLink>
      <nav className="portal-nav__links" aria-label="Driver">
        <NavLink to="/driver/dashboard" className={linkClass} end>
          Dashboard
        </NavLink>
        <NavLink to="/driver/trips" className={linkClass}>
          Trips
        </NavLink>
        <NavLink to="/driver/tours" className={linkClass}>
          Tours
        </NavLink>
        <NavLink to="/driver/history" className={linkClass}>
          History
        </NavLink>
        <button type="button" className="portal-nav__logout" onClick={handleLogout}>
          Log out
        </button>
      </nav>
    </header>
  )
}
