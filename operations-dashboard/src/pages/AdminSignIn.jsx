import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { api, saveDispatchAdminSession } from '../lib/api.js'

export function AdminSignIn() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { data } = await api.post('/login', {
        email: email.trim(),
        password,
      })
      const token = data.access_token || data.token
      const role = String(data.role || '').toLowerCase()
      if (!token) {
        setError('Invalid response from server')
        return
      }
      if (role !== 'admin') {
        setError('This account is not an administrator')
        return
      }
      saveDispatchAdminSession({ token, role: 'admin' })
      navigate('/dashboard', { replace: true })
    } catch (err) {
      const d = err?.response?.data?.detail
      setError(typeof d === 'string' ? d : 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-white/10 bg-slate-900/80 p-6"
      >
        <h1 className="text-lg font-semibold text-white">Dispatcher sign in</h1>
        <p className="text-sm text-slate-400">Use the same admin account as NCC Admin.</p>
        <input
          type="email"
          required
          autoComplete="username"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-white"
        />
        <input
          type="password"
          required
          autoComplete="current-password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-white"
        />
        {error ? <p className="text-sm text-red-300">{error}</p> : null}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-white py-2 text-sm font-semibold text-slate-950 disabled:opacity-60"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
