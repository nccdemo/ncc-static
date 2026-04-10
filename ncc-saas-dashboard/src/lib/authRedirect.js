/** Full navigation so auth state and bundles reload cleanly after logout / 401. */
export function redirectToLogin() {
  window.location.href = '/login'
}
