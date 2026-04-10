/** Key used across tour booking flow (must match B&B / portal expectations). */
export const REFERRAL_STORAGE_KEY = 'referral_code'

/**
 * Referral from the first hostname label (e.g. ``rio5hx.localhost`` → ``RIO5HX``).
 */
export function getSubdomainReferral() {
  if (typeof window === 'undefined') return null
  const host = window.location.hostname

  // rio5hx.localhost → rio5hx
  const parts = host.split('.')

  if (parts.length > 1 && parts[0] !== 'localhost') {
    return parts[0].toUpperCase()
  }

  return null
}

/**
 * Persist referral from subdomain (no query). Prefer calling after ``?ref=`` so URL can override.
 */
export function persistReferralFromHost() {
  if (typeof window === 'undefined') return
  const ref = getSubdomainReferral()
  if (ref) {
    localStorage.setItem(REFERRAL_STORAGE_KEY, ref)
  }
}

/**
 * Read ``?ref=`` from a query string and persist to localStorage so it survives
 * route changes without login.
 */
export function persistReferralFromUrlSearch(search) {
  if (typeof window === 'undefined' || search == null) return
  const q = String(search)
  const params = new URLSearchParams(q.startsWith('?') ? q.slice(1) : q)
  const ref = params.get('ref')
  if (!ref) return
  const normalized = ref.trim().toUpperCase()
  if (normalized) localStorage.setItem(REFERRAL_STORAGE_KEY, normalized)
}

/** Stored referral for API payloads (undefined if empty). */
export function getStoredReferralCode() {
  if (typeof window === 'undefined') return undefined
  const v = (localStorage.getItem(REFERRAL_STORAGE_KEY) || '').trim().toUpperCase()
  return v || undefined
}
