import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { authFetch } from '../api/authFetch.js'
import { setToken } from '../auth/token.js'
import '../components/Login.css'

const API_ORIGIN = (import.meta.env.VITE_API_ORIGIN || 'http://localhost:8000').replace(/\/$/, '')

/**
 * B&B sign-in: POST {API_ORIGIN}/login (users table JWT), then /dashboard/bnb.
 * Drivers use /driver/login (portal unified API).
 */
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
      const res = await fetch(`${API_ORIGIN}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = typeof data?.detail === 'string' ? data.detail : 'Login failed'
        setError(msg)
        return
      }
      if (!data?.access_token) {
        setError('Invalid response from server')
        return
      }
      setToken(data.access_token)
      const role = String(data.role || '').toLowerCase()
      if (role === 'bnb') {
        try {
          // SINGLE SOURCE OF TRUTH: /api/bnb/partner/me (after setToken → Bearer on authFetch)
          const meRes = await authFetch(`${API_ORIGIN}/api/bnb/partner/me`, {
            headers: { Accept: 'application/json' },
          })
          const me = await meRes.json().catch(() => ({}))
          if (meRes.ok && me?.id != null) {
            localStorage.setItem(
              'bnb',
              JSON.stringify({
                id: me.id,
                referral_code: String(me.referral_code || '').trim(),
              }),
            )
          }
        } catch {
          /* dashboard will load profile via /api/bnb/partner/me */
        }
        navigate('/bnb/dashboard', { replace: true })
        return
      }
      if (role === 'driver') {
        navigate('/', { replace: true })
        return
      }
      navigate('/', { replace: true })
    } catch {
      setError('Could not reach server')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="portal-login">
      <form className="portal-login-card" onSubmit={onSubmit}>
        <h1>Sign in</h1>
        <p className="portal-login-muted">B&amp;B account — use the email on your profile.</p>
        <label className="portal-login-label">
          Email
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
            required
            disabled={busy}
          />
        </label>
        <label className="portal-login-label">
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(ev) => setPassword(ev.target.value)}
            required
            disabled={busy}
          />
        </label>
        {error ? <p className="portal-login-error">{error}</p> : null}
        <button type="submit" className="portal-login-submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
