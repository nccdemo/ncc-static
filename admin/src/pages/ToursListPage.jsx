import { useCallback, useEffect, useState } from 'react'

import api from '../api/axios.js'
import PageHeader from '../components/PageHeader'

export default function ToursListPage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await api.get('/tours/')
      setRows(Array.isArray(data) ? data : [])
    } catch (e) {
      const d = e?.response?.data?.detail
      setError(typeof d === 'string' ? d : 'Could not load tours')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="admin-page-main">
      <PageHeader title="Tours" description="Active tours from the catalog (admin API)." />

      <div className="panel-head" style={{ marginBottom: '0.75rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Catalog</h2>
        <div className="panel-head-actions">
          <button type="button" className="btn btn-primary btn-sm" onClick={load} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error ? <p className="banner calendar-error">{error}</p> : null}

      {loading && !rows.length ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Title</th>
                <th>Price</th>
                <th>Active</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td>{t.id}</td>
                  <td>{t.title ?? '—'}</td>
                  <td>{t.price != null ? `€ ${Number(t.price).toFixed(2)}` : '—'}</td>
                  <td>{t.active ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && !loading ? <p className="muted">No tours found.</p> : null}
        </div>
      )}
    </div>
  )
}
