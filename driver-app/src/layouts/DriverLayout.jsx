import { useCallback, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Banknote, Briefcase, CalendarDays, CreditCard, LogOut, Menu, Wallet, X } from 'lucide-react'

import { clearDriverSession } from '../lib/api'

import './DriverLayout.css'

const nav = [
  { to: 'work', label: 'Work', icon: Briefcase, end: true },
  { to: 'earnings', label: 'Earnings', icon: Banknote },
  { to: 'wallet', label: 'Wallet', icon: Wallet },
  { to: 'payments', label: 'Payments', icon: CreditCard },
  { to: 'schedule', label: 'Schedule', icon: CalendarDays },
]

/**
 * @param {{ loginPath?: string }} props
 */
export default function DriverLayout({ loginPath = '/' }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)

  const closeMobile = useCallback(() => setMobileOpen(false), [])

  const onLogout = useCallback(() => {
    clearDriverSession()
    navigate(loginPath, { replace: true })
    setMobileOpen(false)
  }, [loginPath, navigate])

  return (
    <div className="driver-shell">
      <button
        type="button"
        className="driver-shell-menu-btn"
        aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
        onClick={() => setMobileOpen((o) => !o)}
      >
        {mobileOpen ? <X size={22} /> : <Menu size={22} />}
      </button>

      {mobileOpen ? (
        <button type="button" className="driver-shell-backdrop" aria-label="Close menu" onClick={closeMobile} />
      ) : null}

      <aside className={`driver-sidenav${mobileOpen ? ' is-open' : ''}`} aria-label="Driver navigation">
        <div className="driver-sidenav-brand">
          <span className="driver-sidenav-logo">NCC</span>
          <span className="driver-sidenav-title">Driver</span>
        </div>

        <nav className="driver-sidenav-scroll">
          {nav.map((item) => {
            const NavIcon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `driver-nav-link${isActive ? ' is-active' : ''}`}
                onClick={closeMobile}
              >
                <NavIcon className="driver-nav-icon" size={18} strokeWidth={2} aria-hidden />
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </nav>

        <div className="driver-sidenav-footer">
          <button type="button" className="driver-nav-link driver-nav-logout" onClick={onLogout}>
            <LogOut className="driver-nav-icon" size={18} strokeWidth={2} aria-hidden />
            <span>Log out</span>
          </button>
        </div>
      </aside>

      <div className="driver-shell-main">
        <Outlet key={location.pathname} />
      </div>
    </div>
  )
}
