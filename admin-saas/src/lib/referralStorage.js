/** Same key as client-app / B&B partner links: ``?ref=CODE``. */
export const REFERRAL_STORAGE_KEY = 'referral_code'

export function persistReferralFromUrlSearch(search) {
  if (typeof window === 'undefined' || search == null) return
  const q = String(search)
  const params = new URLSearchParams(q.startsWith('?') ? q.slice(1) : q)
  const ref = params.get('ref')
  if (!ref) return
  const normalized = ref.trim().toUpperCase()
  if (normalized) localStorage.setItem(REFERRAL_STORAGE_KEY, normalized)
}

export function getStoredReferralCode() {
  if (typeof window === 'undefined') return undefined
  const v = (localStorage.getItem(REFERRAL_STORAGE_KEY) || '').trim().toUpperCase()
  return v || undefined
}
