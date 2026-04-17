/**
 * API origin (scheme + host + port), no trailing slash.
 * Prefer ``VITE_API_URL``; ``VITE_API_ORIGIN`` is a legacy alias.
 * If unset, use relative paths (``/api``, ``/uploads``) — configure Vite ``proxy`` to the backend.
 */
function readApiOrigin() {
  return String(import.meta.env.VITE_API_URL || import.meta.env.VITE_API_ORIGIN || '')
    .trim()
    .replace(/\/$/, '')
}

export const API_ORIGIN = readApiOrigin()

/**
 * Paths for XHR/fetch: ``/api/...`` may be prefixed with ``API_ORIGIN`` when set.
 * ``/uploads/...`` and ``/static/...`` stay relative (same origin + Vite proxy).
 */
export function apiUrl(path) {
  if (typeof path !== 'string') return path
  const p = path.trim()
  if (!p) return path
  if (p.startsWith('http://') || p.startsWith('https://')) return p
  const normalized = p.startsWith('/') ? p : `/${p}`
  if (normalized.startsWith('/uploads/') || normalized.startsWith('/static/')) {
    return normalized
  }
  if (!API_ORIGIN) return normalized
  return `${API_ORIGIN}${normalized}`
}

/**
 * Any path on the API host (alias of ``apiUrl``).
 */
export function apiAbsolutePath(path) {
  return apiUrl(path)
}

/**
 * Normalized path for ``PUT /api/bnb/me`` (relative ``/uploads/...`` or pathname from absolute URL).
 */
export function brandingPathForApi(value) {
  if (value == null || value === '') return null
  if (typeof value !== 'string') return null
  const s = value.trim()
  if (!s) return null
  if (s.startsWith('http://') || s.startsWith('https://')) {
    try {
      const u = new URL(s)
      const out = (u.pathname || '/') + (u.search || '')
      return out || null
    } catch {
      return null
    }
  }
  return s.startsWith('/') ? s : `/${s}`
}

/**
 * Axios ``baseURL``: ``/api`` when no explicit API origin (Vite proxy); else ``${API_ORIGIN}/api``.
 */
export function apiBasePath() {
  if (!API_ORIGIN) return '/api'
  return `${API_ORIGIN}/api`
}

/**
 * Base WebSocket URL ``ws(s)://host[:port]`` (no path). Uses the page host when ``API_ORIGIN`` is unset (proxy ``/ws``).
 */
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

/** Full WebSocket URL (e.g. ``/ws/trips``). */
export function wsApiUrl(path) {
  const raw = typeof path === 'string' ? path.trim() : ''
  const p = raw.startsWith('/') ? raw : `/${raw || ''}`
  return `${apiWsBaseUrl()}${p}`
}
