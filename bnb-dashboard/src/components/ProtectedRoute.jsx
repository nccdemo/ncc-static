/* Auth gate: intentional ready/loading updates inside effect. */
/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useState } from 'react'
import { Navigate, Outlet, useNavigate } from 'react-router-dom'

import {
  clearSession,
  consumeHandoffFromHash,
  getToken,
  jwtRoleAllowed,
} from '../auth/storage.js'

const SESSION_CHECK_MS = 20000

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('timeout')), ms)
    }),
  ])
}

/**
 * @param {object} props
 * @param {string[]} props.allowedRoles — JWT ``role`` values allowed (e.g. ``['bnb']``), compared lower-case
 * @param {() => Promise<unknown>} [props.sessionCheck] — optional API validation after JWT role check
 */
export default function ProtectedRoute({ allowedRoles = [], sessionCheck }) {
  const navigate = useNavigate()
  const rolesNorm = useMemo(
    () => allowedRoles.map((r) => String(r).toLowerCase()),
    [allowedRoles],
  )
  /** Session API finished (success or failure); avoids infinite “Verifica accesso…”. */
  const [authSettled, setAuthSettled] = useState(false)
  const [sessionOk, setSessionOk] = useState(false)

  consumeHandoffFromHash()
  const token = getToken()
  const hasToken = Boolean(token)
  const roleOk = hasToken && jwtRoleAllowed(token, rolesNorm)

  useEffect(() => {
    if (!hasToken || !roleOk) {
      setAuthSettled(false)
      setSessionOk(false)
      return undefined
    }

    let cancelled = false
    setAuthSettled(false)
    setSessionOk(false)

    function goLogin() {
      clearSession()
      navigate('/login', { replace: true })
    }

    ;(async () => {
      try {
        if (sessionCheck) {
          await withTimeout(sessionCheck(), SESSION_CHECK_MS)
        }
        if (!cancelled) {
          setSessionOk(true)
        }
      } catch {
        if (!cancelled) {
          goLogin()
        }
      } finally {
        if (!cancelled) {
          setAuthSettled(true)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [hasToken, roleOk, sessionCheck, navigate])

  if (!hasToken) {
    return <Navigate to="/login" replace />
  }

  if (!roleOk) {
    clearSession()
    return <Navigate to="/login" replace />
  }

  if (!authSettled) {
    return (
      <div className="boot">
        <div className="boot-card">Verifica accesso…</div>
      </div>
    )
  }

  if (!sessionOk) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
