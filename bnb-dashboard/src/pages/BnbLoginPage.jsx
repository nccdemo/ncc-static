import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  consumeHandoffFromHash,
  getToken,
  jwtRoleAllowed,
  setRole,
  setToken,
} from '../auth/storage.js'

export default function BnbLoginPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    try {
      consumeHandoffFromHash()
      const token = getToken()
      if (token && jwtRoleAllowed(token, ['bnb'])) {
        navigate('/dashboard', { replace: true })
      }
    } finally {
      setLoading(false)
    }
  }, [navigate])

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const res = await fetch('/api/auth/bnb/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = typeof data?.detail === 'string' ? data.detail : 'Accesso non riuscito'
        setError(msg)
        return
      }
      if (!data?.access_token) {
        setError('Risposta dal server non valida')
        return
      }
      setToken(data.access_token)
      setRole('bnb')
      navigate('/dashboard', { replace: true })
    } catch {
      setError('Impossibile contattare il server')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="boot">
        <div className="boot-card">Caricamento…</div>
      </div>
    )
  }

  return (
    <div className="boot">
      <div className="card" style={{ width: '100%', maxWidth: 420 }}>
        <div className="page-head">
          <h1>Accedi — B&amp;B</h1>
          <p>Inserisci email e password del tuo account partner.</p>
        </div>
        <form className="form-grid" onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="bnb-login-email">Email</label>
            <input
              id="bnb-login-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              required
              disabled={busy}
            />
          </div>
          <div className="field">
            <label htmlFor="bnb-login-password">Password</label>
            <input
              id="bnb-login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
              required
              disabled={busy}
            />
          </div>
          {error ? <div className="err">{error}</div> : null}
          <div className="btn-row">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Accesso…' : 'Accedi'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
