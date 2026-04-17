import { useCallback, useEffect, useMemo, useState } from 'react'

import { apiUrl } from '../../api/apiUrl.js'
import { authFetch } from '../../api/authFetch.js'

const mainStyle = {
  padding: '24px 16px 48px',
  maxWidth: 1100,
  margin: '0 auto',
  width: '100%',
  boxSizing: 'border-box',
}

const TRIP_STATUSES = [
  'SCHEDULED',
  'PENDING',
  'ASSIGNED',
  'ACCEPTED',
  'REJECTED',
  'EN_ROUTE',
  'ARRIVED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
]

function detailMessage(detail) {
  if (detail == null) return ''
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail.map((x) => (typeof x === 'object' && x?.msg ? x.msg : String(x))).join('; ')
  }
  if (typeof detail === 'object' && detail.msg) return String(detail.msg)
  return ''
}

/**
 * Admin trip console: lista da ``GET /api/trips/``, stato, driver; azioni su API esistenti + ``POST …/cancel``.
 */
export default function AdminTripsPage() {
  const [trips, setTrips] = useState([])
  const [drivers, setDrivers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  /** Local stato selezionato prima del salvataggio (tripId -> status) */
  const [statusDraft, setStatusDraft] = useState({})
  /** Driver selezionato per riassegnazione (tripId -> driverId string) */
  const [assignDraft, setAssignDraft] = useState({})

  const loadDrivers = useCallback(async () => {
    const res = await authFetch(apiUrl('/api/drivers/'), { headers: { Accept: 'application/json' } })
    if (!res.ok) return
    const data = await res.json().catch(() => [])
    setDrivers(Array.isArray(data) ? data : [])
  }, [])

  const loadTrips = useCallback(async () => {
    const res = await authFetch(apiUrl('/api/trips/'), { headers: { Accept: 'application/json' } })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(detailMessage(body?.detail) || 'Impossibile caricare i trip.')
    }
    const data = await res.json().catch(() => [])
    return Array.isArray(data) ? data : []
  }, [])

  const refresh = useCallback(async () => {
    setError('')
    setLoading(true)
    try {
      await loadDrivers()
      const list = await loadTrips()
      setTrips(list)
      setStatusDraft({})
      setAssignDraft({})
    } catch (e) {
      setError(e?.message || 'Errore di caricamento.')
      setTrips([])
    } finally {
      setLoading(false)
    }
  }, [loadDrivers, loadTrips])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const driverOptions = useMemo(
    () =>
      [...drivers].sort((a, b) =>
        String(a.name || '').localeCompare(String(b.name || ''), 'it', { sensitivity: 'base' }),
      ),
    [drivers],
  )

  const runForTrip = useCallback(async (tripId, fn) => {
    setBusyId(tripId)
    setError('')
    try {
      await fn()
      await refresh()
    } catch (e) {
      setError(e?.message || 'Operazione non riuscita.')
    } finally {
      setBusyId(null)
    }
  }, [refresh])

  const saveStatus = useCallback(
    (trip) => {
      const tid = trip.id
      const next = statusDraft[tid] ?? trip.status
      if (String(next) === String(trip.status)) return
      void runForTrip(tid, async () => {
        const res = await authFetch(apiUrl(`/api/trips/${tid}/status`), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ status: next }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(detailMessage(body?.detail) || 'Aggiornamento stato fallito.')
        }
      })
    },
    [runForTrip, statusDraft],
  )

  const cancelTrip = useCallback(
    (tripId) => {
      if (!window.confirm('Annullare questo trip? Lo stato diventerà CANCELLED e il driver verrà scollegato.')) {
        return
      }
      void runForTrip(tripId, async () => {
        const res = await authFetch(apiUrl(`/api/trips/${tripId}/cancel`), {
          method: 'POST',
          headers: { Accept: 'application/json' },
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(detailMessage(body?.detail) || 'Cancellazione fallita.')
        }
      })
    },
    [runForTrip],
  )

  const reassignDriver = useCallback(
    (trip) => {
      const tid = trip.id
      const raw = assignDraft[tid]
      const driverId = raw != null && raw !== '' ? parseInt(String(raw), 10) : NaN
      if (!Number.isFinite(driverId) || driverId < 1) {
        setError('Seleziona un autista per la riassegnazione.')
        return
      }
      void runForTrip(tid, async () => {
        const res = await authFetch(apiUrl(`/api/trips/${tid}/assign`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ driver_id: driverId, vehicle_id: null }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(detailMessage(body?.detail) || 'Assegnazione fallita.')
        }
      })
    },
    [runForTrip, assignDraft],
  )

  const effectiveStatus = (trip) => statusDraft[trip.id] ?? trip.status

  return (
    <main style={mainStyle}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
        <h1 style={{ margin: 0, fontSize: '1.35rem', color: '#0f172a' }}>Trip</h1>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading || busyId != null}
          style={{
            padding: '6px 12px',
            borderRadius: 8,
            border: '1px solid #cbd5e1',
            background: '#fff',
            fontSize: '0.85rem',
            fontWeight: 600,
            cursor: loading ? 'wait' : 'pointer',
          }}
        >
          Aggiorna elenco
        </button>
      </div>
      <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: '0.88rem', lineHeight: 1.5 }}>
        <code style={{ fontSize: '0.78rem' }}>GET /api/trips/</code> ·{' '}
        <code style={{ fontSize: '0.78rem' }}>PATCH /api/trips/&#123;id&#125;/status</code> ·{' '}
        <code style={{ fontSize: '0.78rem' }}>POST …/assign</code> ·{' '}
        <code style={{ fontSize: '0.78rem' }}>POST …/cancel</code>
      </p>

      {error ? (
        <p style={{ color: '#b91c1c', fontSize: '0.9rem', marginBottom: 12 }} role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p style={{ color: '#64748b' }}>Caricamento…</p>
      ) : trips.length === 0 ? (
        <p style={{ color: '#64748b' }}>Nessun trip.</p>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                <th style={{ padding: '12px 10px', borderBottom: '1px solid #e2e8f0' }}>ID</th>
                <th style={{ padding: '12px 10px', borderBottom: '1px solid #e2e8f0' }}>Data servizio</th>
                <th style={{ padding: '12px 10px', borderBottom: '1px solid #e2e8f0' }}>Stato</th>
                <th style={{ padding: '12px 10px', borderBottom: '1px solid #e2e8f0' }}>Driver</th>
                <th style={{ padding: '12px 10px', borderBottom: '1px solid #e2e8f0', minWidth: 280 }}>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {trips.map((trip) => {
                const tid = trip.id
                const isBusy = busyId === tid
                const driverLabel =
                  trip.driver_id != null
                    ? `${trip.driver_name || '—'} (#${trip.driver_id})`
                    : '—'
                return (
                  <tr key={tid} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px', fontFamily: 'ui-monospace, monospace', fontWeight: 600 }}>{tid}</td>
                    <td style={{ padding: '10px', color: '#475569' }}>
                      {trip.service_date ? String(trip.service_date) : '—'}
                    </td>
                    <td style={{ padding: '10px' }}>
                      <select
                        value={effectiveStatus(trip)}
                        onChange={(e) =>
                          setStatusDraft((d) => ({
                            ...d,
                            [tid]: e.target.value,
                          }))
                        }
                        disabled={isBusy}
                        style={{
                          maxWidth: 160,
                          padding: '6px 8px',
                          borderRadius: 6,
                          border: '1px solid #cbd5e1',
                          fontSize: '0.82rem',
                        }}
                      >
                        {TRIP_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: '10px', color: '#334155' }}>{driverLabel}</td>
                    <td style={{ padding: '10px', verticalAlign: 'top' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <button
                          type="button"
                          disabled={isBusy || String(effectiveStatus(trip)) === String(trip.status)}
                          onClick={() => saveStatus(trip)}
                          style={{
                            alignSelf: 'flex-start',
                            padding: '6px 12px',
                            borderRadius: 6,
                            border: 'none',
                            background: '#0f172a',
                            color: '#fff',
                            fontWeight: 600,
                            fontSize: '0.78rem',
                            cursor: isBusy ? 'wait' : 'pointer',
                            opacity: String(effectiveStatus(trip)) === String(trip.status) ? 0.45 : 1,
                          }}
                        >
                          Salva stato
                        </button>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                          <select
                            value={assignDraft[tid] ?? ''}
                            onChange={(e) =>
                              setAssignDraft((d) => ({
                                ...d,
                                [tid]: e.target.value,
                              }))
                            }
                            disabled={isBusy}
                            style={{
                              flex: '1 1 140px',
                              minWidth: 120,
                              padding: '6px 8px',
                              borderRadius: 6,
                              border: '1px solid #cbd5e1',
                              fontSize: '0.78rem',
                            }}
                          >
                            <option value="">Riassegna a…</option>
                            {driverOptions.map((d) => (
                              <option key={d.id} value={String(d.id)}>
                                {d.name} (#{d.id})
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            disabled={isBusy || !assignDraft[tid]}
                            onClick={() => reassignDriver(trip)}
                            style={{
                              padding: '6px 12px',
                              borderRadius: 6,
                              border: '1px solid #0f172a',
                              background: '#fff',
                              color: '#0f172a',
                              fontWeight: 600,
                              fontSize: '0.78rem',
                              cursor: isBusy ? 'wait' : 'pointer',
                            }}
                          >
                            Assegna
                          </button>
                        </div>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => cancelTrip(tid)}
                          style={{
                            alignSelf: 'flex-start',
                            padding: '6px 12px',
                            borderRadius: 6,
                            border: '1px solid #b91c1c',
                            background: '#fff',
                            color: '#b91c1c',
                            fontWeight: 600,
                            fontSize: '0.78rem',
                            cursor: isBusy ? 'wait' : 'pointer',
                          }}
                        >
                          Cancella trip
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
