import { useCallback, useEffect, useMemo, useState } from 'react'

import api from '../api/axios.js'
import { formatApiDetail } from '../api/client.js'

function formatEUR(v) {
  const n = typeof v === 'number' ? v : Number(v)
  return `€${(Number.isFinite(n) ? n : 0).toFixed(2)}`
}

export default function WorkSummaryView({ driverId, onBack }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data: res } = await api.get(`/drivers/${driverId}/work-summary`)
      setData(res || null)
    } catch (e) {
      console.error(e)
      setError(formatApiDetail(e.response?.data?.detail) || 'Could not load work summary')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [driverId])

  useEffect(() => {
    load()
  }, [load])

  const days = useMemo(() => (Array.isArray(data?.days) ? data.days : []), [data])

  return (
    <div className="screen">
      <div className="toolbar">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          ← Back
        </button>
        <button type="button" className="btn btn-ghost btn-tiny" onClick={load} disabled={loading}>
          Refresh
        </button>
      </div>

      <h1 className="sheet-title">Work Summary</h1>
      <p className="muted sheet-sub">Driver #{driverId}</p>

      {loading && <p className="muted center-pad">Loading…</p>}
      {error && <p className="banner error">{error}</p>}

      {!loading && !error && data ? (
        <>
          <section className="panel">
            <h2>Totals</h2>
            <p>
              Days worked: <strong>{Number(data?.days_worked || 0)}</strong>
              <br />
              Total rides: <strong>{Number(data?.total_rides || 0)}</strong>
              <br />
              Total earned: <strong>{formatEUR(Number(data?.total_amount || 0))}</strong>
            </p>
          </section>

          <section className="panel">
            <h2>Days</h2>
            {days.length === 0 ? (
              <p className="muted">No data yet</p>
            ) : (
              <ul className="booking-list">
                {days.map((d) => (
                  <li key={d.date} className="booking-row">
                    <div className="booking-main">
                      <span className="booking-name">{d.date}</span>
                      <span className="muted-sm">
                        {Number(d.rides_count || 0)} ride(s) · {formatEUR(Number(d.total_amount || 0))}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  )
}

