import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import api from '../api/axios.js'
import { setToken } from '../auth/token.js'
import { formatApiDetail, readDriverSession } from '../lib/api.js'

export default function LoginView({ onLoggedIn }) {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (readDriverSession()?.driver?.id) {
      navigate('/dashboard', { replace: true })
    }
  }, [navigate])

  useEffect(() => {
    if (import.meta.env.VITE_ACCEPT_TOKEN_FROM_URL !== 'true') return undefined
    const sp = new URLSearchParams(window.location.search)
    const t = sp.get('token')
    if (!t) return undefined
    setToken(t)
    sp.delete('token')
    const rest = sp.toString()
    const path = window.location.pathname
    const hash = window.location.hash || ''
    window.history.replaceState({}, '', `${path}${rest ? `?${rest}` : ''}${hash}`)
    onLoggedIn?.()
    navigate('/dashboard', { replace: true })
    return undefined
  }, [navigate, onLoggedIn])

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { data } = await api.post('/auth/driver/login', { email: email.trim(), password })
      setToken(data.access_token)
      onLoggedIn?.()
      navigate('/dashboard', { replace: true })
    } catch (err) {
      const detail = err?.response?.data?.detail
      setError(formatApiDetail(detail) || 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-view">
      <div className="login-card">
        <h1 className="login-title">NCC Driver</h1>
        <p className="login-sub muted">
          Sign in with the email and password you used to register. New accounts stay inactive until an administrator
          approves them — sign-in is blocked until then.
        </p>
        <form className="login-form" onSubmit={onSubmit}>
          <label className="login-label">
            Email
            <input
              className="login-input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="login-label">
            Password
            <input
              className="login-input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error ? <p className="login-error">{error}</p> : null}
          <button type="submit" className="btn btn-primary login-submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
