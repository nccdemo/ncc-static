import { NavLink, useNavigate } from 'react-router-dom'

import { clearToken } from '../auth/token.js'
import './PortalNav.css'

export default function PortalNav() {
  const navigate = useNavigate()

  function handleLogout() {
    clearToken()
    navigate('/driver/login', { replace: true })
  }

  return (
    <header className="portal-nav">
      <NavLink to="/" className="portal-nav__brand" end>
        NCC Portal
      </NavLink>
      <nav className="portal-nav__links" aria-label="Main">
        <NavLink
          to="/trips"
          className={({ isActive }) =>
            `portal-nav__link${isActive ? ' portal-nav__link--active' : ''}`
          }
        >
          Trips
        </NavLink>
        <button type="button" className="portal-nav__logout" onClick={handleLogout}>
          Log out
        </button>
      </nav>
    </header>
  )
}
