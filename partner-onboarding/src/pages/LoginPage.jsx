import { useState } from 'react'
import { Link } from 'react-router-dom'
import { login } from '../api'
import { persistAuth, redirectAfterAuth } from '../session'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await login({ email, password })
      const role = (data.role || '').toLowerCase()
      if (role !== 'driver' && role !== 'bnb') {
        setError(
          'Questo account non è un partner autista o B&B. Usa la dashboard amministratore dedicata.',
        )
        return
      }
      persistAuth({
        access_token: data.access_token,
        role: data.role,
        referral_code: data.referral_code,
      })
      redirectAfterAuth(data.role, data.access_token)
    } catch (err) {
      setError(err.message || 'Accesso non riuscito')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="form-card">
      <h1>Accedi</h1>
      <p className="form-sub">
        Inserisci le credenziali dell&apos;account <strong>users</strong> (autista o B&amp;B). Dopo
        il login verrai reindirizzato al portale corretto.
      </p>
      {error ? <div className="form-error">{error}</div> : null}
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Accesso…' : 'Accedi'}
          </button>
          <Link to="/" className="btn btn-ghost">
            Annulla
          </Link>
        </div>
      </form>
      <p className="field-hint" style={{ marginTop: '1.25rem' }}>
        Non hai un account?{' '}
        <Link to="/register-driver">Autista</Link> · <Link to="/register-bnb">B&amp;B</Link>
      </p>
    </div>
  )
}
