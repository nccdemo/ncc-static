import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import api from '../api/axios.js'
import { formatApiDetail } from '../lib/api.js'

export default function TodayPage() {
  const [rows, setRows] = useState([])
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await api.get('/driver/today-trips')
        if (!cancelled) setRows(data)
      } catch (e) {
        if (!cancelled) setErr(formatApiDetail(e?.response?.data?.detail) || 'Errore caricamento')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="mobile-page">
      <header className="mobile-header">
        <h1>Tour oggi</h1>
      </header>
      {loading ? <p className="muted">Caricamento…</p> : null}
      {err ? <p className="form-error">{err}</p> : null}
      {!loading && rows.length === 0 ? (
        <p className="muted">Nessuna prenotazione confermata per oggi.</p>
      ) : (
        <ul className="trip-list">
          {rows.map((row) => {
            const key = row.booking_id ?? row.trip_id ?? row.customer_name
            const inner = (
              <>
                <div className="trip-card-top">
                  <strong>{row.customer_name || 'Cliente'}</strong>
                  <span className="pill pill-confirmed">{row.status || 'confirmed'}</span>
                </div>
                <div className="muted small">{row.time ? `Ore ${row.time}` : '—'}</div>
                <div className="small">
                  {row.seats} passeggeri · {row.phone || '—'}
                </div>
              </>
            )
            return (
              <li key={key}>
                {row.trip_id != null ? (
                  <Link to={`/driver/trips/${row.trip_id}`} className="trip-card">
                    {inner}
                  </Link>
                ) : (
                  <div className="trip-card">{inner}</div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
