import { useCallback, useEffect, useState } from 'react'

import api from '../api/axios.js'
import './DriverRequestsSection.css'

export default function DriverRequestsSection() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await api.get('/drivers/pending-signups')
      setRows(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error(e)
      setError('Could not load driver requests.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function approve(id) {
    setBusyId(id)
    try {
      await api.patch(`/drivers/${id}/activate`)
      await load()
    } catch (e) {
      console.error(e)
      window.alert('Approve failed.')
    } finally {
      setBusyId(null)
    }
  }

  async function reject(id) {
    if (!window.confirm('Reject this driver request?')) return
    setBusyId(id)
    try {
      await api.post(`/drivers/${id}/reject-signup`)
      await load()
    } catch (e) {
      console.error(e)
      window.alert('Reject failed.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="driver-requests-section panel">
      <div className="driver-requests-head">
        <h2>Driver requests</h2>
        <p className="muted">Drivers who registered from the public landing page. Approve to activate their account and allow app login.</p>
        <button type="button" className="btn btn-sm" onClick={() => load()} disabled={loading}>
          Refresh
        </button>
      </div>

      {error && <p className="driver-requests-error">{error}</p>}

      {loading && rows.length === 0 ? (
        <p className="muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="muted">No pending requests.</p>
      ) : (
        <ul className="driver-requests-list">
          {rows.map((r) => (
            <li key={r.id} className="driver-requests-card">
              <div className="driver-requests-card-main">
                <div className="driver-requests-name">{r.name}</div>
                <div className="driver-requests-meta">
                  <span>{r.email || '—'}</span>
                  <span>{r.phone}</span>
                </div>
                <div className="driver-requests-badge">Pending</div>
              </div>
              <div className="driver-requests-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={busyId != null}
                  onClick={() => approve(r.id)}
                >
                  {busyId === r.id ? '…' : 'Approve'}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busyId != null}
                  onClick={() => reject(r.id)}
                >
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
