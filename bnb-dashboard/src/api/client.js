import { getToken, redirectToLogin } from '../auth/storage.js'

import { API_ORIGIN } from './apiUrl.js'

export { API_ORIGIN }

export const BNB_UPLOAD_LOGO_URL = `${API_ORIGIN}/api/bnb/upload-logo`
export const BNB_UPLOAD_COVER_URL = `${API_ORIGIN}/api/bnb/upload-cover`

async function readError(res) {
  try {
    const data = await res.json()
    if (data?.detail) {
      if (typeof data.detail === 'string') return data.detail
      if (Array.isArray(data.detail)) {
        return data.detail.map((d) => d.msg || JSON.stringify(d)).join(', ')
      }
    }
    return res.statusText || 'Request failed'
  } catch {
    return res.statusText || 'Request failed'
  }
}

export async function apiFetch(path, options = {}) {
  const token = getToken()
  const headers = {
    Accept: 'application/json',
    ...options.headers,
  }
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const res = await fetch(`/api${path}`, { ...options, headers })

  if (res.status === 401 || res.status === 403) {
    redirectToLogin()
    throw new Error('Sessione non valida')
  }

  return res
}

export async function apiJson(path, options = {}) {
  const res = await apiFetch(path, options)
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  if (res.status === 204) return null
  return res.json()
}

/** JWT role ``bnb`` required (no dev bypass). */
export function getBnbPartnerMe() {
  return apiJson('/bnb/partner/me')
}

export function updateBnbMe(payload) {
  return apiJson('/bnb/me', {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function getBnbPartnerSummary() {
  return apiJson('/bnb/partner/summary')
}

export function getBnbPartnerEarnings() {
  return apiJson('/bnb/partner/earnings')
}
