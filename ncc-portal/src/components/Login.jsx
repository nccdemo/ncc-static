import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import api from '../api/axios.js'
import { setToken } from '../auth/token.js'
import './Login.css'

/**
 * @param {{
 *   title: string
 *   subtitle?: string
 *   loginPath: string
 *   redirectTo: string
 *   roleRedirects?: Record<string, string> | null
 *   submitLabel?: string
 * }} props
 */
export default function Login({
  title,
  subtitle,
  loginPath,
  redirectTo,
  roleRedirects = null,
  submitLabel = 'Sign in',
}) {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

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
    navigate(redirectTo, { replace: true })
    return undefined
  }, [navigate, redirectTo])

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { data } = await api.post(loginPath, {
        email: email.trim(),
        password,
      })
      if (data?.access_token) {
        setToken(data.access_token)
        const role = data?.role != null ? String(data.role) : ''
        const byRole =
          role && roleRedirects && roleRedirects[role] != null ? roleRedirects[role] : null
        navigate(byRole ?? redirectTo, { replace: true })
      } else {
        setError('Invalid response from server')
      }
    } catch (err) {
      const status = err?.response?.status
      const d = err?.response?.data?.detail
      if (typeof d === 'string') {
        setError(d)
      } else if (status === 403) {
        setError('Account pending approval')
      } else if (Array.isArray(d)) {
        setError(d.map((x) => x?.msg || String(x)).join(' ') || 'Login failed')
      } else {
        setError('Invalid credentials')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="portal-login">
      <form className="portal-login-card" onSubmit={onSubmit}>
        <h1>{title}</h1>
        {subtitle ? <p className="portal-login-muted">{subtitle}</p> : null}
        <label className="portal-login-label">
          Email
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={busy}
          />
        </label>
        {error ? <p className="portal-login-error">{error}</p> : null}
        <button type="submit" className="portal-login-submit" disabled={busy}>
          {busy ? 'Signing in…' : submitLabel}
        </button>
      </form>
    </div>
  )
}
