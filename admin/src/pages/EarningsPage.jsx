import { useCallback, useEffect, useState } from 'react'

import api from '../api/axios.js'
import PageHeader from '../components/PageHeader'

function fmtEuro(n) {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : Number(n || 0)
  return `€ ${v.toFixed(2)}`
}

export default function EarningsPage() {
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [summary, setSummary] = useState(null)
  const [platform, setPlatform] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = {}
      if (fromDate) params.from_date = fromDate
      if (toDate) params.to_date = toDate
      const [sRes, pRes] = await Promise.all([
        api.get('/payments/summary', { params }),
        api.get('/payments/platform-financials').catch(() => ({ data: null })),
      ])
      setSummary(sRes.data || null)
      setPlatform(pRes.data || null)
    } catch (e) {
      const d = e?.response?.data?.detail
      setError(typeof d === 'string' ? d : 'Could not load earnings data')
      setSummary(null)
      setPlatform(null)
    } finally {
      setLoading(false)
    }
  }, [fromDate, toDate])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="admin-page-main">
      <PageHeader
        title="Earnings"
        description="Payment totals and platform financials from the payments service."
      />

      <div className="panel" style={{ marginBottom: '1rem' }}>
        <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.05rem' }}>Filters</h2>
        <div className="stack-form" style={{ maxWidth: '480px' }}>
          <label className="field">
            <span>From date</span>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </label>
          <label className="field">
            <span>To date</span>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </label>
          <div className="form-actions" style={{ justifyContent: 'flex-start' }}>
            <button type="button" className="btn btn-primary btn-sm" onClick={load} disabled={loading}>
              {loading ? 'Loading…' : 'Apply'}
            </button>
          </div>
        </div>
      </div>

      {error ? <p className="banner calendar-error">{error}</p> : null}

      {summary ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: '1rem',
            marginBottom: '1rem',
          }}
        >
          <div className="panel" style={{ margin: 0 }}>
            <div className="muted" style={{ fontSize: '0.8rem' }}>
              Total paid
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{fmtEuro(summary.total_paid)}</div>
          </div>
          <div className="panel" style={{ margin: 0 }}>
            <div className="muted" style={{ fontSize: '0.8rem' }}>
              Refunded
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{fmtEuro(summary.refunded)}</div>
          </div>
          <div className="panel" style={{ margin: 0 }}>
            <div className="muted" style={{ fontSize: '0.8rem' }}>
              Cash paid
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{fmtEuro(summary.cash_paid)}</div>
          </div>
          <div className="panel" style={{ margin: 0 }}>
            <div className="muted" style={{ fontSize: '0.8rem' }}>
              Net
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{fmtEuro(summary.net)}</div>
          </div>
        </div>
      ) : null}

      {platform ? (
        <div className="panel">
          <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.05rem' }}>Platform</h2>
          <ul style={{ margin: 0, paddingLeft: '1.15rem' }}>
            <li>Commission revenue: {fmtEuro(platform.total_commission_revenue)}</li>
            <li>Driver payouts: {fmtEuro(platform.total_driver_payouts)}</li>
            <li>Cash commission owed (wallets): {fmtEuro(platform.total_cash_commission_owed)}</li>
          </ul>
        </div>
      ) : null}
    </div>
  )
}
