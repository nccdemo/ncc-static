import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { parseJwtPayloadRole, setRole, setToken } from '../auth/storage.js'

export default function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    setErr('')
    setLoading(true)
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(typeof data.detail === 'string' ? data.detail : 'Accesso negato')
        return
      }
      const token = data.access_token || data.token
      if (!token) {
        setErr('Risposta non valida dal server')
        return
      }
      const role = String(data.role || parseJwtPayloadRole(token) || '').toLowerCase()
      if (role !== 'admin') {
        setErr('Questo account non è un amministratore')
        return
      }
      setToken(token)
      setRole('admin')
      navigate('/dashboard', { replace: true })
    } catch {
      setErr('Errore di rete')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>Accesso amministratore</h1>
        <p>Accedi con un utente <strong>users.role = admin</strong>.</p>
        {err ? <div className="err">{err}</div> : null}
        <form className="form-grid" onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div className="btn-row">
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Accesso…' : 'Entra'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
