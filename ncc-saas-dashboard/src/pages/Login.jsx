import { useState } from 'react'

const LOGIN_URL = 'http://127.0.0.1:8000/api/auth/login'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()
    setErr('')
    setLoading(true)
    try {
      const res = await fetch(LOGIN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg =
          typeof data.detail === 'string'
            ? data.detail
            : Array.isArray(data.detail)
              ? data.detail.map((d) => d.msg || JSON.stringify(d)).join(', ')
              : 'Login fallito'
        setErr(msg)
        return
      }
      const token = data.access_token
      if (!token) {
        setErr('Risposta non valida dal server')
        return
      }
      localStorage.setItem('token', token)
      window.location.href = '/admin'
    } catch {
      setErr('Errore di rete')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-8">
      <div className="w-full max-w-sm space-y-6 rounded-lg border border-border bg-card p-8 shadow-sm">
        <h2 className="text-xl font-semibold tracking-tight">Accedi</h2>
        <p className="text-sm text-muted-foreground">Porta locale 5191 — JWT salvato in localStorage.</p>
        {err ? <p className="text-sm text-destructive">{err}</p> : null}
        <form className="space-y-4" onSubmit={handleLogin}>
          <input
            type="email"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
          />
          <input
            type="password"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {loading ? 'Accesso…' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  )
}
