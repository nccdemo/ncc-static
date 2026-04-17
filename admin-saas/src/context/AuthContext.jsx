import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import { api } from '../lib/api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const token = localStorage.getItem('token')
  const [status, setStatus] = useState(token ? 'loading' : 'anonymous') // loading | ready | anonymous | error
  const [user, setUser] = useState(null)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    const t = localStorage.getItem('token')
    if (!t) {
      setUser(null)
      setError(null)
      setStatus('anonymous')
      return
    }
    setStatus('loading')
    setError(null)
    try {
      const { data } = await api.get('/api/auth/me')
      setUser({
        id: data?.id ?? null,
        email: data?.email ?? null,
        role: String(data?.role || '').toLowerCase(),
        company_id: data?.company_id ?? null,
        company_name: data?.company_name ?? null,
      })
      setStatus('ready')
    } catch (e) {
      setUser(null)
      setStatus('error')
      setError(String(e?.response?.data?.detail ?? e?.message ?? 'Auth failed'))
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const logout = useCallback(() => {
    localStorage.removeItem('token')
    setUser(null)
    setError(null)
    setStatus('anonymous')
  }, [])

  const value = useMemo(
    () => ({
      status,
      user,
      error,
      role: user?.role || null,
      company_id: user?.company_id ?? null,
      refresh,
      logout,
    }),
    [status, user, error, refresh, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

