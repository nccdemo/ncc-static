import { Link, Outlet, useNavigate } from 'react-router-dom'

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Link
            to="/bnb/dashboard"
            style={{
              color: '#f8fafc',
              fontSize: '0.875rem',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Dashboard
          </Link>
          <Link
            to="/bnb/tours"
            style={{
              color: '#f8fafc',
              fontSize: '0.875rem',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Link tour
          </Link>
          <button type="button" style={logoutStyle} onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>
      <Outlet />
    </div>
  )
}
