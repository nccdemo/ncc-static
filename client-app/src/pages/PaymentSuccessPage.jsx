import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import axios from '../api/axios.js'

const POLL_MS = 2000
const MAX_ATTEMPTS = 20

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

function formatTime(t) {
  if (!t) return '—'
  const s = String(t)
  return s.length >= 5 ? s.slice(0, 5) : s
}

export default function PaymentSuccessPage() {
  const [params] = useSearchParams()
  const sessionId = (params.get('session_id') || params.get('sessionId') || '').trim()

  const [details, setDetails] = useState(null)
  const [loading, setLoading] = useState(Boolean(sessionId))
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(null)
  const attemptsRef = useRef(0)
  const timerRef = useRef(null)

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const fetchSummary = useCallback(async () => {
    if (!sessionId) {
      setLoading(false)
      return
    }
    try {
      const { data } = await axios.get('/public/checkout-success', { params: { session_id: sessionId } })
      setDetails(data)
      setError(null)
      setPending(false)
      setLoading(false)
      clearTimer()
    } catch (e) {
      const status = e.response?.status
      if (status === 404 && attemptsRef.current < MAX_ATTEMPTS) {
        attemptsRef.current += 1
        setPending(true)
        setLoading(false)
        timerRef.current = setTimeout(() => {
          void fetchSummary()
        }, POLL_MS)
        return
      }
      setError(
        status === 404
          ? 'Booking is still being confirmed. You can refresh this page in a moment or check your email.'
          : e.response?.data?.detail || e.message || 'Could not load booking details.',
      )
      setLoading(false)
      setPending(false)
      clearTimer()
    }
  }, [sessionId])

  useEffect(() => {
    attemptsRef.current = 0
    if (!sessionId) {
      setLoading(false)
      return undefined
    }
    setLoading(true)
    setError(null)
    setDetails(null)
    void fetchSummary()
    return () => {
      clearTimer()
    }
  }, [sessionId, fetchSummary])

  if (!sessionId) {
    return (
      <div className="page-narrow">
        <h1 style={{ marginTop: 0 }}>Payment successful</h1>
        <p className="landing-muted">Open this page from the link after checkout to see your booking details.</p>
        <p style={{ marginTop: '1.5rem' }}>
          <Link to="/tours">Browse tours</Link>
          {' · '}
          <Link to="/explore">Home</Link>
        </p>
      </div>
    )
  }

  return (
    <div className="page-narrow">
      <h1 style={{ marginTop: 0 }}>Payment successful</h1>
      <p style={{ marginBottom: '1.25rem' }}>Thank you. Your booking is confirmed.</p>

      {loading ? <p className="landing-muted">Loading your booking…</p> : null}
      {pending ? (
        <p className="banner-warn" style={{ marginTop: 0 }}>
          Confirming your booking with our servers… this usually takes a few seconds.
        </p>
      ) : null}
      {error ? <p className="banner-err">{error}</p> : null}

      {details ? (
        <>
          <div className="instance-card" style={{ marginBottom: '1.25rem' }}>
            <h2 className="instance-title" style={{ marginTop: 0 }}>
              Booking details
            </h2>
            <dl className="success-dl">
              {details.tour_title ? (
                <>
                  <dt>Tour</dt>
                  <dd>{details.tour_title}</dd>
                </>
              ) : null}
              <dt>Name</dt>
              <dd>{details.customer_name || '—'}</dd>
              <dt>Email</dt>
              <dd style={{ wordBreak: 'break-word' }}>{details.email || '—'}</dd>
              <dt>Guests</dt>
              <dd>{details.people}</dd>
              <dt>Total</dt>
              <dd>
                {typeof details.price === 'number'
                  ? new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(details.price)
                  : '—'}
              </dd>
              <dt>Date</dt>
              <dd>{formatDate(details.date)}</dd>
              <dt>Time</dt>
              <dd>{formatTime(details.time)}</dd>
              <dt>Status</dt>
              <dd>{details.status || '—'}</dd>
              <dt>Booking</dt>
              <dd>#{details.booking_id}</dd>
            </dl>
          </div>

          {details.tracking_token ? (
            <p style={{ margin: '0 0 1rem' }}>
              <Link className="btn btn-primary" to={`/track/${encodeURIComponent(details.tracking_token)}`}>
                Track your driver
              </Link>
            </p>
          ) : (
            <p className="landing-muted" style={{ fontSize: '0.95rem' }}>
              Driver tracking becomes available once your trip is assigned. Check your email for updates.
            </p>
          )}
        </>
      ) : null}

      <p style={{ marginTop: '1.5rem' }}>
        <Link to="/tours">More tours</Link>
        {' · '}
        <Link to="/explore">Home</Link>
      </p>
    </div>
  )
}
