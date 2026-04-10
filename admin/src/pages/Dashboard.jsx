import { useNavigate } from 'react-router-dom'

export default function Dashboard() {
  const navigate = useNavigate()

  function handleLogout() {
    localStorage.removeItem('token')
    navigate('/login', { replace: true })
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          padding: '12px 20px',
          borderBottom: '1px solid #e5e7eb',
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={handleLogout}
          style={{
            padding: '8px 14px',
            fontSize: '0.875rem',
            cursor: 'pointer',
            borderRadius: '6px',
            border: '1px solid #d1d5db',
            background: '#fff',
          }}
        >
          Logout
        </button>
      </header>
      <main style={{ padding: 40, flex: 1 }}>
        <h1 style={{ marginTop: 0 }}>Dashboard</h1>
        <p>Admin area — you are signed in.</p>
      </main>
    </div>
  )
}
