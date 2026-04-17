import { useCallback, useEffect, useState } from 'react'

import { requestDriverLocationRestart } from '../components/DriverLocationReporter.jsx'
import { fetchTodayTrips, updateDriverTripStatus } from '../api/driverTrips.js'
import { formatApiDetail } from '../lib/api.js'

function displayDatetime(row) {
  return row?.datetime ?? row?.service_datetime ?? row?.time ?? '—'
}

function statusUpper(row) {
  return String(row?.status ?? '').toUpperCase()
}

export default function TodayTripsPage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [busyTripId, setBusyTripId] = useState(null)
  const [actionMsg, setActionMsg] = useState('')

  const load = useCallback(async () => {
    setErr('')
    setLoading(true)
    try {
      const data = await fetchTodayTrips()
      setRows(data)
    } catch (e) {
      setRows([])
      setErr(formatApiDetail(e?.response?.data?.detail) || e?.message || 'Errore caricamento')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const onStartTrip = async (tripId) => {
    setErr('')
    setActionMsg('')
    setBusyTripId(tripId)
    try {
      await updateDriverTripStatus(tripId, 'in_progress')
      requestDriverLocationRestart()
      setActionMsg('Trip avviato.')
      await load()
    } catch (e) {
      setErr(formatApiDetail(e?.response?.data?.detail) || e?.message || 'Impossibile avviare')
    } finally {
      setBusyTripId(null)
    }
  }

  const onCompleteTrip = async (tripId) => {
    setErr('')
    setActionMsg('')
    setBusyTripId(tripId)
    try {
      await updateDriverTripStatus(tripId, 'completed')
      setActionMsg('Trip completato.')
      await load()
    } catch (e) {
      setErr(formatApiDetail(e?.response?.data?.detail) || e?.message || 'Impossibile completare')
    } finally {
      setBusyTripId(null)
    }
  }

  return (
    <div className="mobile-page">
      <header className="mobile-header">
        <h1>Oggi — transfer</h1>
        <p className="muted small" style={{ marginTop: 6 }}>
          Corse assegnate per oggi
        </p>
      </header>

      <div style={{ marginBottom: 12 }}>
        <button type="button" className="btn" onClick={() => load()} disabled={loading}>
          {loading ? 'Aggiornamento…' : 'Aggiorna'}
        </button>
      </div>

      {actionMsg ? <p className="muted" style={{ marginBottom: 8 }}>{actionMsg}</p> : null}
      {loading ? <p className="muted">Caricamento…</p> : null}
      {err ? <p className="form-error">{err}</p> : null}

      {!loading && rows.length === 0 ? (
        <p className="muted">Nessuna corsa per oggi.</p>
      ) : (
        <ul className="trip-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {rows.map((row) => {
            const tripId = row.trip_id
            const st = statusUpper(row)
            const hasTrip = tripId != null && Number.isFinite(Number(tripId))
            const canStart =
              hasTrip &&
              !['IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'EXPIRED'].includes(st)
            const canComplete = hasTrip && st === 'IN_PROGRESS'
            const busy = busyTripId === Number(tripId)

            return (
              <li key={row.booking_id} className="trip-card" style={{ marginBottom: 12, padding: 14 }}>
                <div className="trip-card-top" style={{ marginBottom: 8 }}>
                  <strong>{row.customer_name || 'Cliente'}</strong>
                  <span className="pill pill-confirmed" style={{ textTransform: 'uppercase', fontSize: 11 }}>
                    {row.status || '—'}
                  </span>
                </div>
                <dl className="small" style={{ margin: 0, display: 'grid', gap: 6 }}>
                  <div>
                    <dt className="muted" style={{ display: 'inline', marginRight: 6 }}>
                      Ritiro
                    </dt>
                    <dd style={{ display: 'inline', margin: 0 }}>{row.pickup || '—'}</dd>
                  </div>
                  <div>
                    <dt className="muted" style={{ display: 'inline', marginRight: 6 }}>
                      Destinazione
                    </dt>
                    <dd style={{ display: 'inline', margin: 0 }}>{row.dropoff || '—'}</dd>
                  </div>
                  <div>
                    <dt className="muted" style={{ display: 'inline', marginRight: 6 }}>
                      Data/ora
                    </dt>
                    <dd style={{ display: 'inline', margin: 0 }}>{displayDatetime(row)}</dd>
                  </div>
                </dl>

                {hasTrip ? (
                  <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={!canStart || busy}
                      onClick={() => onStartTrip(Number(tripId))}
                    >
                      {busy ? '…' : 'Start Trip'}
                    </button>
                    <button
                      type="button"
                      className="btn"
                      disabled={!canComplete || busy}
                      onClick={() => onCompleteTrip(Number(tripId))}
                    >
                      {busy ? '…' : 'Complete Trip'}
                    </button>
                  </div>
                ) : (
                  <p className="muted small" style={{ marginTop: 10 }}>
                    Trip NCC non collegato: avvio da app tour o dettaglio.
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
