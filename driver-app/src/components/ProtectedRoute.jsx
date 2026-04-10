/* Auth gate: intentional ready/loading updates inside effect. */
/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useState } from 'react'
import { Outlet } from 'react-router-dom'

import {
  consumeHandoffFromHash,
  getToken,
  jwtRoleAllowed,
  redirectToLogin,
} from '../auth/token.js'

/**
 * @param {object} props
 * @param {string[]} props.allowedRoles — JWT ``role`` values allowed (e.g. ``['driver']``), compared lower-case
 * @param {() => Promise<unknown>} [props.sessionCheck] — optional API validation after JWT role check
 */
export default function ProtectedRoute({ allowedRoles = [], sessionCheck }) {
  const rolesNorm = useMemo(
    () => allowedRoles.map((r) => String(r).toLowerCase()),
    [allowedRoles],
  )
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    setReady(false)
    consumeHandoffFromHash()

    const token = getToken()
    if (!token) {
      redirectToLogin()
      return undefined
    }

    if (!jwtRoleAllowed(token, rolesNorm)) {
      redirectToLogin()
      return undefined
    }

    ;(async () => {
      if (sessionCheck) {
        try {
          await sessionCheck()
        } catch {
          if (!cancelled) redirectToLogin()
          return
        }
      }
      if (!cancelled) setReady(true)
    })()

    return () => {
      cancelled = true
    }
  }, [rolesNorm, sessionCheck])

  if (!ready) {
    return (
      <div className="mobile-page muted" style={{ padding: '2rem' }}>
        Verifica accesso…
      </div>
    )
  }

  return <Outlet />
}
