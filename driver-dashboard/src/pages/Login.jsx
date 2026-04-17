import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { loginDriver } from '../api/client.js'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await loginDriver({ email: email.trim(), password })
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err?.message || 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="boot">
      <form className="boot-card" onSubmit={onSubmit} style={{ maxWidth: 420, width: '100%' }}>
        <h1 style={{ margin: 0, fontSize: '1.25rem' }}>Driver login</h1>
        <p style={{ margin: '8px 0 0', color: '#475569', fontSize: '0.95rem' }}>
          Sign in to access your dashboard.
        </p>

        <label style={{ display: 'grid', gap: 6, marginTop: 16 }}>
          <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Email</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="username"
            required
            disabled={busy}
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid #e2e8f0',
              outline: 'none',
            }}
          />
        </label>

        <label style={{ display: 'grid', gap: 6, marginTop: 12 }}>
          <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Password</span>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
            required
            disabled={busy}
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid #e2e8f0',
              outline: 'none',
            }}
          />
        </label>

        {error ? (
          <p style={{ margin: '12px 0 0', color: '#dc2626', fontSize: '0.95rem' }}>{error}</p>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          style={{
            marginTop: 16,
            width: '100%',
            padding: '10px 14px',
            borderRadius: 10,
            border: '1px solid #0c4a6e',
            background: '#0c4a6e',
            color: 'white',
            fontWeight: 700,
            cursor: busy ? 'not-allowed' : 'pointer',
          }}
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}

