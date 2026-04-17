import { getToken } from '../auth/token.js'

/**
 * Canonical authenticated fetch for the portal (single implementation: this file).
 * Merges ``Authorization: Bearer`` from ``getToken()`` only.
 * For ``FormData`` bodies, ``Content-Type`` is omitted so the browser sets multipart boundaries.
 */
export function authFetch(url, options = {}) {
  const token = getToken()

  const headers = {
    ...(options.headers && typeof options.headers === 'object' ? { ...options.headers } : {}),
  }

  if (options.body instanceof FormData) {
    delete headers['Content-Type']
    delete headers['content-type']
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  return fetch(url, {
    ...options,
    headers,
  })
}
