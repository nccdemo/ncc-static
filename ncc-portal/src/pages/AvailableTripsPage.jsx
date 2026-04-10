import { useCallback, useEffect, useState } from 'react'

import api from '../api/axios.js'
import './AvailableTripsPage.css'

function formatPrice(v) {
  if (v == null || Number.isNaN(Number(v))) return '—'
  return `€${Number(v).toFixed(2)}`
}

export default function AvailableTripsPage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await api.get('/trips/available')
      setRows(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error(e)
      const d = e?.response?.data?.detail
      setError(typeof d === 'string' ? d : 'Could not load available trips.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function accept(id) {
    setBusyId(id)
    try {
      await api.post(`/trips/${id}/accept`)
      await load()
    } catch (e) {
      console.error(e)
      const d = e?.response?.data?.detail
      window.alert(typeof d === 'string' ? d : 'Could not accept this trip.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="available-trips">
      <header className="available-trips__header">
        <div>
          <h1 className="available-trips__title">Available trips</h1>
          <p className="available-trips__subtitle">Open jobs you can accept. First tap wins.</p>
        </div>
        <div className="available-trips__actions">
          <button type="button" className="available-trips__btn secondary" onClick={() => load()} disabled={loading}>
            Refresh
          </button>
        </div>
      </header>

      {error ? <p className="available-trips__error">{error}</p> : null}

      {loading && rows.length === 0 ? (
        <p className="available-trips__muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="available-trips__muted">No open trips right now.</p>
      ) : (
        <ul className="available-trips__list">
          {rows.map((t) => (
            <li key={t.id} className="available-trips__card">
              <div className="available-trips__card-main">
                <div className="available-trips__route">
                  <span className="available-trips__label">Route</span>
                  <p className="available-trips__route-line">
                    <strong>{t.pickup || 'Pickup TBD'}</strong>
                    <span className="available-trips__arrow"> → </span>
                    <strong>{t.destination || 'Destination TBD'}</strong>
                  </p>
                </div>
                <div className="available-trips__meta">
                  <div>
                    <span className="available-trips__label">Price</span>
                    <p>{formatPrice(t.price)}</p>
                  </div>
                  <div>
                    <span className="available-trips__label">Time</span>
                    <p>{t.time || t.service_date || '—'}</p>
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="available-trips__btn primary"
                disabled={busyId != null}
                onClick={() => accept(t.id)}
              >
                {busyId === t.id ? '…' : 'Accept trip'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
