import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import api from '../api/axios.js'
import { setToken, getToken, parseJwtPayload, PARTNER_ONBOARDING_URL } from '../auth/token.js'
import { formatApiDetail, readDriverSession } from '../lib/api.js'

function consumeHashJwt() {
  const h = window.location.hash
  if (!h || !h.includes('ncc_partner_jwt=')) return false
  try {
    const params = new URLSearchParams(h.replace(/^#/, ''))
    const jwt = params.get('ncc_partner_jwt')
    if (jwt) {
      setToken(decodeURIComponent(jwt))
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
      return true
    }
  } catch {
    /* ignore */
  }
  return false
}

export default function MobileLogin() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (consumeHashJwt()) {
      const role = String(parseJwtPayload(getToken())?.role || '').toLowerCase()
      if (role === 'driver') {
        navigate('/driver/today', { replace: true })
        return
      }
    }
    if (readDriverSession()) {
      navigate('/driver/today', { replace: true })
    }
  }, [navigate])

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      let data
      try {
        const r = await api.post('/auth/login', {
          email: email.trim(),
          password,
        })
        data = r.data
        if (String(data?.role || '').toLowerCase() !== 'driver') {
          setError('Questo account non è un autista. Usa il portale corretto.')
          return
        }
      } catch {
        const r = await api.post('/auth/driver/login', {
          email: email.trim(),
          password,
        })
        data = r.data
      }
      setToken(data.access_token)
      navigate('/driver/today', { replace: true })
    } catch (err) {
      const detail = err?.response?.data?.detail
      setError(formatApiDetail(detail) || 'Accesso non riuscito')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mobile-login">
      <div className="mobile-login-card">
        <h1>NCC Driver</h1>
        <p className="muted">
          Accedi con il JWT da{' '}
          {PARTNER_ONBOARDING_URL ? (
            <a href={PARTNER_ONBOARDING_URL} rel="noreferrer">
              partner onboarding
            </a>
          ) : (
            'partner onboarding'
          )}{' '}
          (reindirizzamento automatico) oppure con email e password.
        </p>
        <form className="mobile-form" onSubmit={onSubmit}>
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Accesso…' : 'Accedi'}
          </button>
        </form>
      </div>
    </div>
  )
}
