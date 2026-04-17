import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { apiAbsolutePath } from '../api/apiUrl.js'
import '../components/Login.css'

export default function BnbRegisterPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const res = await fetch(apiAbsolutePath('/bnb/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const d = data?.detail
        if (typeof d === 'string') {
          setError(d)
        } else if (Array.isArray(d)) {
          setError(d.map((x) => x?.msg || String(x)).join(' ') || 'Registration failed')
        } else {
          setError('Registration failed')
        }
        return
      }
      navigate('/bnb-dashboard', { replace: true })
    } catch {
      setError('Could not reach server')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="portal-login">
      <form className="portal-login-card" onSubmit={onSubmit}>
        <h1>B&amp;B sign up</h1>
        <p className="portal-login-muted">
          Create your account. You’ll get a referral code after registering.
        </p>
        <label className="portal-login-label">
          Name
          <input
            type="text"
            name="name"
            autoComplete="name"
            value={name}
            onChange={(ev) => setName(ev.target.value)}
            required
            disabled={busy}
            minLength={1}
            style={{ minHeight: 44 }}
          />
        </label>
        <label className="portal-login-label">
          Email
          <input
            type="email"
            name="email"
            autoComplete="email"
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
            required
            disabled={busy}
            style={{ minHeight: 44 }}
          />
        </label>
        <label className="portal-login-label">
          Phone
          <input
            type="tel"
            name="phone"
            autoComplete="tel"
            inputMode="tel"
            value={phone}
            onChange={(ev) => setPhone(ev.target.value)}
            required
            disabled={busy}
            style={{ minHeight: 44 }}
          />
        </label>
        {error ? <p className="portal-login-error">{error}</p> : null}
        <button type="submit" className="portal-login-submit" disabled={busy} style={{ minHeight: 48 }}>
          {busy ? 'Creating account…' : 'Register'}
        </button>
        <p className="portal-login-muted" style={{ marginTop: '1.1rem', marginBottom: 0, textAlign: 'center' }}>
          <Link to="/login" style={{ color: '#38bdf8' }}>
            Already have an account? Sign in
          </Link>
        </p>
      </form>
    </div>
  )
}
