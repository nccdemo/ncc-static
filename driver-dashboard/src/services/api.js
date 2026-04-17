import { getToken, redirectToLogin } from '../auth/storage.js'

async function readError(res) {
  try {
    const data = await res.json()
    if (typeof data?.detail === 'string') return data.detail
    if (Array.isArray(data?.detail)) {
      return data.detail.map((d) => d?.msg || JSON.stringify(d)).join(', ')
    }
    return res.statusText || 'Request failed'
  } catch {
    return res.statusText || 'Request failed'
  }
}

/**
 * Fetch wrapper for the driver dashboard.
 * - Prefixes paths with /api
 * - Adds Authorization: Bearer <token> automatically when available
 * - Handles JSON + errors consistently
 */
export async function apiFetch(path, options = {}) {
  const token = getToken()
  const headers = {
    Accept: 'application/json',
    ...(options.headers && typeof options.headers === 'object' ? { ...options.headers } : {}),
  }

  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`/api${path}`, { ...options, headers })

  if (res.status === 401 || res.status === 403) {
    redirectToLogin()
    throw new Error('Sessione non valida')
  }

  return res
}

export async function apiJson(path, options = {}) {
  const res = await apiFetch(path, options)
  if (!res.ok) throw new Error(await readError(res))
  if (res.status === 204) return null
  return res.json()
}

// Compatibility alias (some services prefer a short name).
export const api = apiJson

