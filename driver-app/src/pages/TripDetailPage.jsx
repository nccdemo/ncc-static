import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import api from '../api/axios.js'
import { formatApiDetail } from '../lib/api.js'

const NEXT = {
  confirmed: { label: 'Avvia servizio', next: 'in_progress' },
  in_progress: { label: 'Completa', next: 'completed' },
}

export default function TripDetailPage() {
  const { id } = useParams()
  const [trip, setTrip] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  async function load() {
    setErr('')
    try {
      const { data } = await api.get(`/driver/trips/${id}`)
      setTrip(data)
    } catch (e) {
      setErr(formatApiDetail(e?.response?.data?.detail) || 'Corsa non trovata')
      setTrip(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when trip id changes
  }, [id])

  async function postStatus(next) {
    setBusy(true)
    setErr('')
    try {
      await api.post(`/driver/trips/${id}/status`, { status: next })
      await load()
    } catch (e) {
      setErr(formatApiDetail(e?.response?.data?.detail) || 'Aggiornamento non riuscito')
    } finally {
      setBusy(false)
    }
  }

  const ms = trip?.mobile_status
  const action = ms && NEXT[ms]

  return (
    <div className="mobile-page">
      <header className="mobile-header">
        <Link to="/today" className="back-link">
          ← Oggi
        </Link>
        <h1>Corsa #{id}</h1>
      </header>
      {loading ? <p className="muted">Caricamento…</p> : null}
      {err ? <p className="form-error">{err}</p> : null}
      {trip ? (
        <div className="detail-card">
          <p>
            <span className="muted">Cliente</span>
            <br />
            <strong>{trip.customer_name || '—'}</strong>
          </p>
          <p>
            <span className="muted">Telefono</span>
            <br />
            {trip.customer_phone ? (
              <a href={`tel:${trip.customer_phone}`}>{trip.customer_phone}</a>
            ) : (
              '—'
            )}
          </p>
          <p>
            <span className="muted">Passeggeri</span>
            <br />
            {trip.seats ?? '—'}
          </p>
          <p>
            <span className="muted">Pickup</span>
            <br />
            {trip.pickup || '—'}
          </p>
          <p>
            <span className="muted">Stato</span>
            <br />
            <span className={`pill pill-${trip.mobile_status || 'confirmed'}`}>
              {trip.mobile_status || trip.status}
            </span>{' '}
            <span className="muted small">({trip.status})</span>
          </p>
          {action ? (
            <button
              type="button"
              className="btn-primary btn-block"
              disabled={busy}
              onClick={() => postStatus(action.next)}
            >
              {busy ? '…' : action.label}
            </button>
          ) : null}
          {trip.mobile_status === 'completed' ? (
            <p className="muted small">Servizio completato.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
