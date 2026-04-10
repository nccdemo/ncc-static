import { useCallback, useEffect, useMemo, useState } from 'react'

import api from '../api/axios.js'
import CalendarSection from '../components/CalendarSection'
import PageHeader from '../components/PageHeader'

export default function TourInstancesPage() {
  const [tab, setTab] = useState('list')
  const [rows, setRows] = useState([])
  const [tours, setTours] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [iRes, tRes] = await Promise.all([api.get('/tour-instances'), api.get('/tours/')])
      setRows(Array.isArray(iRes.data) ? iRes.data : [])
      setTours(Array.isArray(tRes.data) ? tRes.data : [])
    } catch (e) {
      const d = e?.response?.data?.detail
      setError(typeof d === 'string' ? d : 'Could not load tour instances')
      setRows([])
      setTours([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const titleByTourId = useMemo(() => {
    const m = new Map()
    for (const t of tours) {
      if (t?.id != null) m.set(Number(t.id), t.title || `Tour #${t.id}`)
    }
    return m
  }, [tours])

  return (
    <div className="admin-page-main">
      <PageHeader
        title="Tour instances"
        description="Scheduled tour runs, capacity, and calendar view of trips & tours."
      />

      <div className="panel-head" style={{ marginBottom: '1rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '0.35rem' }}>
          <button
            type="button"
            className={`btn btn-sm${tab === 'list' ? ' btn-primary' : ''}`}
            onClick={() => setTab('list')}
          >
            List
          </button>
          <button
            type="button"
            className={`btn btn-sm${tab === 'calendar' ? ' btn-primary' : ''}`}
            onClick={() => setTab('calendar')}
          >
            Calendar
          </button>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={load} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error ? <p className="banner calendar-error">{error}</p> : null}

      {tab === 'list' ? (
        loading && !rows.length ? (
          <p className="muted">Loading…</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Tour</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Capacity</th>
                  <th>Booked</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.id}</td>
                    <td>{titleByTourId.get(Number(r.tour_id)) || `Tour #${r.tour_id}`}</td>
                    <td>{r.date ?? '—'}</td>
                    <td>{r.status ?? '—'}</td>
                    <td>{r.capacity ?? r.total_seats ?? '—'}</td>
                    <td>{r.booked ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && !loading ? <p className="muted">No instances.</p> : null}
          </div>
        )
      ) : (
        <main className="admin-calendar-main">
          <CalendarSection />
        </main>
      )}
    </div>
  )
}
