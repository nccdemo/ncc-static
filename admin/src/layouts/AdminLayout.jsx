import { useCallback, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Banknote,
  CalendarDays,
  Car,
  CreditCard,
  LayoutDashboard,
  LogOut,
  MapPinned,
  Menu,
  Route as RouteIcon,
  Truck,
  Users,
  X,
} from 'lucide-react'

import { clearToken } from '../auth/token.js'

import './AdminLayout.css'

const nav = [
  { to: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: 'trips', label: 'Trips', icon: RouteIcon },
  { to: 'drivers', label: 'Drivers', icon: Users },
  { to: 'vehicles', label: 'Vehicles', icon: Truck },
  { to: 'custom-rides', label: 'Custom Rides', icon: Car },
  { to: 'tours', label: 'Tours', icon: MapPinned },
  { to: 'tour-instances', label: 'Tour Instances', icon: CalendarDays },
  { to: 'earnings', label: 'Earnings', icon: Banknote },
  { to: 'payments', label: 'Payments', icon: CreditCard },
]

/**
 * @param {{ loginPath?: string }} props
 */
export default function AdminLayout({ loginPath = '/login' }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)

  const closeMobile = useCallback(() => setMobileOpen(false), [])

  const onLogout = useCallback(() => {
    clearToken()
    navigate(loginPath, { replace: true })
    setMobileOpen(false)
  }, [loginPath, navigate])

  return (
    <div className="admin-shell">
      <button
        type="button"
        className="admin-shell-menu-btn"
        aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
        onClick={() => setMobileOpen((o) => !o)}
      >
        {mobileOpen ? <X size={22} /> : <Menu size={22} />}
      </button>

      {mobileOpen ? (
        <button type="button" className="admin-shell-backdrop" aria-label="Close menu" onClick={closeMobile} />
      ) : null}

      <aside className={`admin-sidenav${mobileOpen ? ' is-open' : ''}`} aria-label="Main navigation">
        <div className="admin-sidenav-brand">
          <span className="admin-sidenav-logo">NCC</span>
          <span className="admin-sidenav-title">Admin</span>
        </div>

        <nav className="admin-sidenav-scroll">
          {nav.map((item) => {
            const NavIcon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `admin-nav-link${isActive ? ' is-active' : ''}`}
                onClick={closeMobile}
              >
                <NavIcon className="admin-nav-icon" size={18} strokeWidth={2} aria-hidden />
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </nav>

        <div className="admin-sidenav-footer">
          <button type="button" className="admin-nav-link admin-nav-logout" onClick={onLogout}>
            <LogOut className="admin-nav-icon" size={18} strokeWidth={2} aria-hidden />
            <span>Log out</span>
          </button>
        </div>
      </aside>

      <div className="admin-shell-main">
        <Outlet key={location.pathname} />
      </div>
    </div>
  )
}
