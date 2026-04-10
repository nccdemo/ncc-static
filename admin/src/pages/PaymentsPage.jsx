import { useCallback, useEffect, useState } from 'react'

import api from '../api/axios.js'
import PageHeader from '../components/PageHeader'

function statusLabel(s) {
  const x = String(s || '').toLowerCase()
  if (x === 'paid') return 'Paid'
  if (x === 'refunded') return 'Refunded'
  if (x === 'cash_paid') return 'Cash'
  return x || '—'
}

export default function PaymentsPage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterCustomer, setFilterCustomer] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = {}
      if (filterStatus) params.status = filterStatus
      if (filterCustomer) params.customer = filterCustomer
      if (filterFrom) params.from_date = filterFrom
      if (filterTo) params.to_date = filterTo
      const { data } = await api.get('/payments', { params })
      setRows(Array.isArray(data) ? data : [])
    } catch (e) {
      const d = e?.response?.data?.detail
      setError(typeof d === 'string' ? d : 'Could not load payments')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [filterStatus, filterCustomer, filterFrom, filterTo])

  useEffect(() => {
    load()
  }, [load])

  async function refund(id) {
    setBusyId(id)
    try {
      await api.post(`/payments/${id}/refund`)
      await load()
    } catch (e) {
      const d = e?.response?.data?.detail
      setError(typeof d === 'string' ? d : 'Refund failed')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="admin-page-main">
      <PageHeader title="Payments" description="Booking payments, filters, and refunds." />

      <div className="panel" style={{ marginBottom: '1rem' }}>
        <div className="stack-form" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem' }}>
          <label className="field">
            <span>Status</span>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="">All</option>
              <option value="pending">pending</option>
              <option value="paid">paid</option>
              <option value="refunded">refunded</option>
              <option value="cash_paid">cash_paid</option>
            </select>
          </label>
          <label className="field">
            <span>Customer</span>
            <input value={filterCustomer} onChange={(e) => setFilterCustomer(e.target.value)} placeholder="Name or email" />
          </label>
          <label className="field">
            <span>From</span>
            <input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} />
          </label>
          <label className="field">
            <span>To</span>
            <input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} />
          </label>
        </div>
        <div className="form-actions" style={{ justifyContent: 'flex-start', marginTop: '0.75rem' }}>
          <button type="button" className="btn btn-primary btn-sm" onClick={load} disabled={loading}>
            {loading ? 'Loading…' : 'Search'}
          </button>
        </div>
      </div>

      {error ? <p className="banner calendar-error">{error}</p> : null}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Booking</th>
              <th>Customer</th>
              <th>Email</th>
              <th>Amount</th>
              <th>Status</th>
              <th className="col-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>{p.id}</td>
                <td>{p.booking_id}</td>
                <td>{p.customer_name ?? '—'}</td>
                <td>{p.email ?? '—'}</td>
                <td>€ {Number(p.amount || 0).toFixed(2)}</td>
                <td>{statusLabel(p.status)}</td>
                <td className="col-actions">
                  {String(p.status || '').toLowerCase() === 'paid' ? (
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      disabled={busyId === p.id}
                      onClick={() => refund(p.id)}
                    >
                      {busyId === p.id ? '…' : 'Refund'}
                    </button>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && !loading ? <p className="muted">No payments.</p> : null}
      </div>
    </div>
  )
}
