import { setRole, setToken } from '../auth/storage.js'

async function readError(res) {
  try {
    const data = await res.json()
    if (typeof data?.detail === 'string') return data.detail
    if (Array.isArray(data?.detail)) {
      return data.detail.map((d) => d?.msg || JSON.stringify(d)).join(', ')
    }
    return res.statusText || 'Login failed'
  } catch {
    return res.statusText || 'Login failed'
  }
}

export async function loginDriver({ email, password }) {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, password }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((await readError(res)) || 'Login failed')

  const token = data?.access_token || data?.token || ''
  if (!token) throw new Error('Invalid login response')

  setToken(token)
  if (data?.role) setRole(String(data.role).toLowerCase())
  return data
}

