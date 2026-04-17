/**
 * FastAPI origin for JSON and media. Unset → relative URLs + Vite proxy.
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
  if (normalized.startsWith('/uploads/') || normalized.startsWith('/static/')) {
    return normalized
  }
  if (!API_ORIGIN) return normalized
  return `${API_ORIGIN}${normalized}`
}

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

export function apiBasePath() {
  if (!API_ORIGIN) return '/api'
  return `${API_ORIGIN}/api`
}
