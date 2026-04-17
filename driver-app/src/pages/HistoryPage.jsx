import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import api from '../api/axios.js'
import { formatApiDetail } from '../lib/api.js'

export default function HistoryPage() {
  const [rows, setRows] = useState([])
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await api.get('/driver/trips-history')
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
        <h1>Storico</h1>
      </header>
      {loading ? <p className="muted">Caricamento…</p> : null}
      {err ? <p className="form-error">{err}</p> : null}
      {!loading && rows.length === 0 ? (
        <p className="muted">Nessuna corsa nello storico.</p>
      ) : (
        <ul className="trip-list">
          {rows.map((t) => (
            <li key={t.id}>
              <Link to={`/driver/trips/${t.id}`} className="trip-card">
                <div className="trip-card-top">
                  <strong>{t.customer_name || 'Cliente'}</strong>
                  <span className={`pill pill-${t.mobile_status}`}>{t.mobile_status}</span>
                </div>
                <div className="muted small">{t.service_date || '—'}</div>
                <div className="small">{t.pickup || '—'}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
