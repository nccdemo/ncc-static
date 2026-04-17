import { useCallback, useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'

import { getDriverMe } from '../api/client.js'
import { LOGIN_URL, clearSession } from '../auth/storage.js'

const nav = [
  { to: '/dashboard', label: 'Dashboard', end: true },
  { to: '/trips', label: 'Trips' },
  { to: '/tours', label: 'Tours' },
  { to: '/earnings', label: 'Earnings' },
]

function IconMenu() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
    </svg>
  )
}

function IconClose() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  )
}

function IconUser() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

/**
 * Reusable dashboard shell: fixed sidebar, topbar (user), main content.
 * Sidebar collapses off-canvas on small viewports; open via menu control.
 */
export default function DashboardLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [user, setUser] = useState(null)

  const closeMobile = useCallback(() => setMobileOpen(false), [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const me = await getDriverMe()
        if (!cancelled) setUser(me)
      } catch {
        if (!cancelled) setUser(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const displayName = (user?.name || '').trim() || 'Driver'
  const displayEmail = (user?.email || '').trim()
  const displayId = user?.driver_id != null ? `#${user.driver_id}` : ''

  const onSignOut = useCallback(() => {
    clearSession()
    window.location.href = LOGIN_URL
  }, [])

  return (
    <div className="dash-shell">
      <button
        type="button"
        className="dash-menu-btn"
        aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
        aria-expanded={mobileOpen}
        onClick={() => setMobileOpen((o) => !o)}
      >
        {mobileOpen ? <IconClose /> : <IconMenu />}
      </button>

      {mobileOpen ? (
        <button type="button" className="dash-backdrop" aria-label="Close menu" onClick={closeMobile} />
      ) : null}

      <aside className={`dash-sidebar${mobileOpen ? ' is-open' : ''}`} aria-label="Main navigation">
        <div className="dash-sidebar-inner">
          <div className="dash-brand">NCC Driver</div>
          <nav className="dash-nav">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `dash-nav-link${isActive ? ' is-active' : ''}`}
                onClick={closeMobile}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <a className="dash-sidebar-exit" href={LOGIN_URL} onClick={closeMobile}>
            Partner login
          </a>
        </div>
      </aside>

      <div className="dash-body">
        <header className="dash-topbar">
          <div className="dash-topbar-spacer" aria-hidden />
          <div className="dash-user">
            <span className="dash-user-icon" aria-hidden>
              <IconUser />
            </span>
            <div className="dash-user-text">
              <span className="dash-user-name">{displayName}</span>
              <span className="dash-user-meta">
                {[displayEmail, displayId].filter(Boolean).join(' · ') || 'Signed in'}
              </span>
            </div>
            <button type="button" className="dash-signout" onClick={onSignOut}>
              Sign out
            </button>
          </div>
        </header>

        <main className="dash-main">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
