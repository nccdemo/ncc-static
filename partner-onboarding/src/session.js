const TOKEN_KEY = 'ncc_partner_access_token'
const ROLE_KEY = 'ncc_partner_role'
const REFERRAL_KEY = 'ncc_partner_referral_code'

export function persistAuth({ access_token, role, referral_code }) {
  if (access_token) localStorage.setItem(TOKEN_KEY, access_token)
  if (role) localStorage.setItem(ROLE_KEY, role)
  if (referral_code) localStorage.setItem(REFERRAL_KEY, referral_code)
  else localStorage.removeItem(REFERRAL_KEY)
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(ROLE_KEY)
  localStorage.removeItem(REFERRAL_KEY)
}

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function getStoredRole() {
  return localStorage.getItem(ROLE_KEY)
}

const DRIVER_PORTAL = 'http://localhost:5177'
const BNB_PORTAL = 'http://localhost:5178'

/**
 * Cross-origin portals cannot read this app's localStorage.
 * We append a one-time JWT in the URL hash so 5177/5178 can import it on load (optional).
 */
export function redirectAfterAuth(role, accessToken) {
  const r = (role || '').toLowerCase()
  if (r === 'driver') {
    window.location.replace(
      `${DRIVER_PORTAL}#ncc_partner_jwt=${encodeURIComponent(accessToken)}`,
    )
    return
  }
  if (r === 'bnb') {
    window.location.replace(
      `${BNB_PORTAL}#ncc_partner_jwt=${encodeURIComponent(accessToken)}`,
    )
    return
  }
  throw new Error(`Unsupported role for portal redirect: ${role}`)
}
