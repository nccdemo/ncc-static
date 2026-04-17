import { NavLink, Outlet, useNavigate } from 'react-router-dom'

import { clearToken } from '../auth/token.js'

const headerStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '14px 18px',
  background: '#0f172a',
  color: '#f8fafc',
  flexWrap: 'wrap',
}

const brandStyle = {
  fontWeight: 700,
  fontSize: '1rem',
  letterSpacing: '-0.02em',
}

const navLinkStyle = ({ isActive }) => ({
  color: '#f8fafc',
  fontSize: '0.875rem',
  fontWeight: 600,
  textDecoration: 'none',
  opacity: isActive ? 1 : 0.85,
  borderBottom: isActive ? '2px solid #38bdf8' : '2px solid transparent',
  paddingBottom: 2,
})

const logoutStyle = {
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px solid rgba(248,250,252,0.35)',
  background: 'transparent',
  color: '#f8fafc',
  fontSize: '0.875rem',
  fontWeight: 600,
  cursor: 'pointer',
}

const navRowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  flexWrap: 'wrap',
}

export default function BnbLayout() {
  const navigate = useNavigate()

  function handleLogout() {
    clearToken()
    navigate('/login', { replace: true })
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      <header style={headerStyle}>
        <span style={brandStyle}>B&amp;B Portal</span>
        <div style={{ ...navRowStyle, flex: 1, justifyContent: 'flex-end' }}>
          <nav style={{ ...navRowStyle, marginRight: 8 }} aria-label="B&amp;B">
            <NavLink to="/bnb-dashboard" style={navLinkStyle} end>
              Dashboard
            </NavLink>
            <NavLink to="/bnb/earnings" style={navLinkStyle}>
              Earnings
            </NavLink>
            <NavLink to="/bnb/referrals" style={navLinkStyle}>
              Referrals
            </NavLink>
            <NavLink to="/bnb/affiliate-tours" style={navLinkStyle}>
              Tour affiliate
            </NavLink>
            <NavLink to="/bnb/profile" style={navLinkStyle}>
              Profilo
            </NavLink>
          </nav>
          <button type="button" style={logoutStyle} onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>
      <Outlet />
    </div>
  )
}
