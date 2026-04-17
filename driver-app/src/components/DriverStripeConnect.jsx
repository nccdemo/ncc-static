import { useCallback, useEffect, useState } from 'react'

import { connectStripe, getStripeStatus } from '../api/stripe.js'
import { formatApiDetail } from '../lib/api.js'

/** Stripe Connect banner: onboarding link + payment-ready state. */
export default function DriverStripeConnect() {
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState({
    connected: false,
    charges_enabled: false,
    payouts_enabled: false,
  })

  const load = useCallback(async () => {
    setError('')
    setLoading(true)
    try {
      const data = await getStripeStatus()
      setStatus({
        connected: Boolean(data?.connected),
        charges_enabled: Boolean(data?.charges_enabled),
        payouts_enabled: Boolean(data?.payouts_enabled),
      })
    } catch (e) {
      setError(
        formatApiDetail(e?.response?.data?.detail) ||
          (typeof e?.message === 'string' ? e.message : '') ||
          'Impossibile caricare lo stato Stripe.',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const onConnect = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      const data = await connectStripe()
      const url = data?.url
      if (typeof url === 'string' && url.startsWith('http')) {
        window.location.assign(url)
        return
      }
      setError('Risposta Stripe senza URL di onboarding.')
    } catch (e) {
      setError(
        formatApiDetail(e?.response?.data?.detail) ||
          (typeof e?.message === 'string' ? e.message : '') ||
          'Collegamento Stripe non riuscito.',
      )
    } finally {
      setBusy(false)
    }
  }, [])

  if (loading) {
    return (
      <section className="card" style={{ marginBottom: '1rem', padding: '0.75rem 1rem' }}>
        <p className="muted" style={{ margin: 0 }}>
          Verifica Stripe…
        </p>
      </section>
    )
  }

  const { connected, charges_enabled: chargesEnabled } = status

  return (
    <section className="card" style={{ marginBottom: '1rem', padding: '0.75rem 1rem' }}>
      {error ? (
        <p className="banner error" role="alert" style={{ marginBottom: '0.5rem' }}>
          {error}
        </p>
      ) : null}
      {!connected ? (
        <>
          <p style={{ margin: '0 0 0.5rem' }}>Collega Stripe per accettare pagamenti con carta.</p>
          <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={onConnect}>
            {busy ? 'Apertura Stripe…' : 'Connect Stripe'}
          </button>
        </>
      ) : !chargesEnabled ? (
        <>
          <p className="banner warn" style={{ margin: '0 0 0.5rem' }}>
            Complete Stripe setup
          </p>
          <button type="button" className="btn btn-outline btn-block" disabled={busy} onClick={onConnect}>
            {busy ? 'Apertura Stripe…' : 'Continua onboarding Stripe'}
          </button>
        </>
      ) : (
        <p className="banner success" style={{ margin: 0 }}>
          Ready to receive payments
        </p>
      )}
      <button
        type="button"
        className="btn btn-ghost btn-tiny"
        style={{ marginTop: '0.5rem' }}
        onClick={() => load()}
      >
        Aggiorna stato
      </button>
    </section>
  )
}
