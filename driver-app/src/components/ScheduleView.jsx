import { useCallback, useEffect, useMemo, useState } from 'react'

import api from '../api/axios.js'
import { formatApiDetail } from '../api/client.js'

function groupByDate(items) {
  const map = new Map()
  for (const it of items) {
    const d = it?.date || '—'
    if (!map.has(d)) map.set(d, [])
    map.get(d).push(it)
  }
  return Array.from(map.entries()).sort((a, b) => String(a[0]).localeCompare(String(b[0])))
}

function formatTimeLine(it) {
  const parts = []
  if (it.start_time) parts.push(`Start ${it.start_time}`)
  if (it.end_time) parts.push(`End ${it.end_time}`)
  return parts.join(' · ')
}

function scheduleTitle(it) {
  const tour = it.tour
  const trip = it.trip
  if (tour?.title) {
    return tour.title
  }
  if (trip?.id != null) {
    const route = [trip.pickup, trip.destination].filter(Boolean).join(' → ')
    return route ? `Trip #${trip.id} · ${route}` : `Trip #${trip.id}`
  }
  if (it.trip_id) return `Trip #${it.trip_id}`
  if (it.tour_instance_id) return `Tour instance #${it.tour_instance_id}`
  return 'Scheduled item'
}

function scheduleSubtitle(it) {
  const bits = []
  const timeLine = formatTimeLine(it)
  if (timeLine) bits.push(timeLine)
  if (it.status) bits.push(it.status)
  if (it.source === 'tour_instance') bits.push('from tour calendar')
  if (it.tour?.instance_status) bits.push(`instance ${it.tour.instance_status}`)
  if (it.trip?.status) bits.push(`trip ${it.trip.status}`)
  return bits.join(' · ')
}

export default function ScheduleView({ driverId, onBack }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data: res } = await api.get(`/drivers/${driverId}/schedule`)
      setData(res || null)
    } catch (e) {
      console.error(e)
      let msg = 'Could not load schedule'
      if (e?.code === 'ERR_NETWORK' || e?.message === 'Network Error') {
        msg = 'Network error — check connection and API URL.'
      } else if (e?.response?.data?.detail != null) {
        msg = formatApiDetail(e.response.data.detail)
      } else if (typeof e?.response?.status === 'number') {
        msg = `Request failed (HTTP ${e.response.status}).`
      }
      setError(msg)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [driverId])

  useEffect(() => {
    load()
  }, [load])

  const items = useMemo(() => (Array.isArray(data?.items) ? data.items : []), [data])
  const grouped = useMemo(() => groupByDate(items), [items])

  return (
    <div className="screen">
      <div className="toolbar">
        <div>
          {typeof onBack === 'function' ? (
            <button type="button" className="btn btn-ghost" onClick={onBack}>
              ← Back
            </button>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
          <button type="button" className="btn btn-ghost btn-tiny" onClick={load} disabled={loading}>
            Refresh
          </button>
        </div>
      </div>

      <h1 className="sheet-title">My Schedule</h1>
      <p className="muted sheet-sub">Trips and tour instances</p>

      {loading && <p className="muted center-pad">Loading…</p>}
      {error && <p className="banner error">{error}</p>}

      {!loading && !error ? (
        <>
          {grouped.length === 0 ? (
            <section className="panel">
              <p className="muted">No scheduled items yet</p>
            </section>
          ) : (
            grouped.map(([date, rows]) => (
              <section key={date} className="panel">
                <h2>{date}</h2>
                <ul className="booking-list">
                  {rows.map((it) => (
                    <li key={it.id} className="booking-row">
                      <div className="booking-main">
                        <span className="booking-name">{scheduleTitle(it)}</span>
                        <span className="muted-sm">{scheduleSubtitle(it)}</span>
                        {it.tour?.vehicle_name ? (
                          <span className="muted-sm">Vehicle: {it.tour.vehicle_name}</span>
                        ) : null}
                        {it.trip?.pickup || it.trip?.destination ? (
                          <span className="muted-sm">
                            {[it.trip.pickup, it.trip.destination].filter(Boolean).join(' → ')}
                          </span>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </>
      ) : null}
    </div>
  )
}
