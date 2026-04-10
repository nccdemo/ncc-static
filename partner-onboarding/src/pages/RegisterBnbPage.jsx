import { useState } from 'react'
import { Link } from 'react-router-dom'
import { registerBnb } from '../api'
import { persistAuth } from '../session'

const BNB_DASHBOARD_URL = 'http://localhost:5178'

export default function RegisterBnbPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const nameOut = name.trim() || 'B&B Partner'
      const data = await registerBnb({
        name: nameOut,
        email: email.trim(),
        password,
      })
      persistAuth({
        access_token: data.access_token,
        role: data.role,
        referral_code: data.referral_code,
      })
      window.location.replace(BNB_DASHBOARD_URL)
    } catch (err) {
      setError(err.message || 'Registrazione non riuscita')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="form-card">
      <h1>Registrazione B&amp;B</h1>
      <p className="form-sub">
        Crea il tuo account e ricevi subito un <strong>codice referral</strong> per guadagnare sulle
        prenotazioni confermate.
      </p>
      {error ? <div className="form-error">{error}</div> : null}
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="rb-name">Nome struttura</label>
          <input
            id="rb-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="(opzionale)"
          />
          <p className="field-hint">Puoi lasciarlo vuoto e aggiungerlo dopo.</p>
        </div>
        <div className="field">
          <label htmlFor="rb-email">Email</label>
          <input
            id="rb-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="rb-password">Password</label>
          <input
            id="rb-password"
            type="password"
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <p className="field-hint">Minimo 8 caratteri.</p>
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Registrazione…' : 'Registrati e continua'}
          </button>
          <Link to="/login" className="btn btn-ghost">
            Ho già un account
          </Link>
        </div>
      </form>
    </div>
  )
}
