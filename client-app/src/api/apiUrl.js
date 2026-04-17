/**
 * API origin, no trailing slash. ``VITE_API_URL`` or legacy ``VITE_API_ORIGIN``; unset → relative URLs + Vite proxy.
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
  // Same-origin static files (Vite proxy → FastAPI ``StaticFiles``)
  if (normalized.startsWith('/uploads/') || normalized.startsWith('/static/')) {
    return normalized
  }
  if (!API_ORIGIN) return normalized
  return `${API_ORIGIN}${normalized}`
}

export function apiAbsolutePath(path) {
  return apiUrl(path)
}

/**
 * Axios ``baseURL`` for paths under ``/api``.
 */
export function apiBasePath() {
  if (!API_ORIGIN) return '/api'
  return `${API_ORIGIN}/api`
}
