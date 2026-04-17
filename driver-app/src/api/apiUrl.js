/**
 * API origin for JSON and WebSocket (unset → same-origin ``/api`` + Vite proxy).
 * ``VITE_API_URL`` preferred; ``VITE_API_ORIGIN`` legacy alias.
 */
function readApiOrigin() {
  return String(import.meta.env.VITE_API_URL || import.meta.env.VITE_API_ORIGIN || '')
    .trim()
    .replace(/\/$/, '')
}

export const API_ORIGIN = readApiOrigin()

export function apiUrl(path) {
  if (typeof path !== 'string') return path
  const p = path.trim()
  if (!p) return path
  if (p.startsWith('http://') || p.startsWith('https://')) return p
  const normalized = p.startsWith('/') ? p : `/${p}`
  if (!API_ORIGIN) return normalized
  return `${API_ORIGIN}${normalized}`
}

export function apiBasePath() {
  if (!API_ORIGIN) return '/api'
  return `${API_ORIGIN}/api`
}

export function apiWsBaseUrl() {
  if (API_ORIGIN) {
    try {
      const href = API_ORIGIN.includes('://') ? API_ORIGIN : `http://${API_ORIGIN}`
      const u = new URL(href)
      const wsProto = u.protocol === 'https:' ? 'wss:' : 'ws:'
      return `${wsProto}//${u.host}`
    } catch {
      /* fall through */
    }
  }
  if (typeof window === 'undefined') {
    throw new Error('apiWsBaseUrl: set VITE_API_URL or use in the browser only')
  }
  const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${wsProto}//${window.location.host}`
}

/** @deprecated Use ``apiWsBaseUrl`` or ``wsApiUrl``. */
export function apiWsOrigin() {
  return apiWsBaseUrl()
}

export function wsApiUrl(path) {
  const raw = typeof path === 'string' ? path.trim() : ''
  const p = raw.startsWith('/') ? raw : `/${raw || ''}`
  return `${apiWsBaseUrl()}${p}`
}
