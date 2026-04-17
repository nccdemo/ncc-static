import { useState } from 'react'

import { apiUrl } from '../api/apiUrl.js'
import { authFetch } from '../api/authFetch.js'
import { setLoginRole, setToken } from '../auth/token.js'
import '../components/Login.css'

function loginErrorMessage(data) {
  const d = data?.detail
  if (typeof d === 'string') return d
  if (Array.isArray(d)) {
    return d
      .map((x) => (typeof x?.msg === 'string' ? x.msg : JSON.stringify(x)))
      .join(', ')
  }
  return 'Login failed'
}

/**
 * After successful ``POST /api/login``, send the user to the correct standalone app.
 * Override with Vite env if ports differ in your setup.
 */
function postLoginExternalUrl(role) {
  const r = String(role || '').toLowerCase()
  const adminBase = (import.meta.env.VITE_ADMIN_SAAS_URL || 'http://localhost:5176').replace(/\/$/, '')
  const driverBase = (import.meta.env.VITE_DRIVER_APP_URL || 'http://localhost:5174').replace(/\/$/, '')
  const bnbUrl =
    import.meta.env.VITE_BNB_DASHBOARD_URL ||
    (typeof window !== 'undefined'
      ? `${window.location.origin}/bnb-dashboard`
      : 'http://localhost:5178/bnb-dashboard')

  if (r === 'admin') return adminBase
  if (r === 'driver') return driverBase
  if (r === 'bnb') return bnbUrl
  return null
}

/**
 * Single portal sign-in: ``POST /api/login`` (admin, driver, B&amp;B, legacy driver).
 */
export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const res = await fetch(apiUrl('/api/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(loginErrorMessage(data))
        return
      }

      const token = data?.access_token || data?.token
      if (!token) {
        setError('Invalid response from server')
        return
      }

      const role = data?.role != null ? String(data.role).toLowerCase() : ''
      if (!role) {
        console.error('Login response missing role', data)
        setError('Invalid session: role missing')
        return
      }

      setToken(token)
      setLoginRole(role)

      const dest = postLoginExternalUrl(role)
      if (!dest) {
        setError('Unsupported account type for this portal')
        return
      }

      if (role === 'bnb') {
        try {
          const meRes = await authFetch(apiUrl('/api/bnb/partner/me'), {
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
          /* dashboard loads profile via /api/bnb/partner/me */
        }
      }

      window.location.assign(dest)
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
        <p className="portal-login-muted">Admin, driver, or B&amp;B — same email and password.</p>
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
