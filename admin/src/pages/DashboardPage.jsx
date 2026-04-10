import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import api from '../api/axios.js'
import PageHeader from '../components/PageHeader'

function StatCard({ label, value }) {
  return (
    <div className="panel" style={{ margin: 0 }}>
      <div className="muted" style={{ fontSize: '0.8rem', marginBottom: '0.35rem' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.35rem', fontWeight: 600 }}>{value}</div>
    </div>
  )
}

export default function DashboardPage() {
  const [summary, setSummary] = useState(null)
  const [platform, setPlatform] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [sRes, pRes] = await Promise.all([
        api.get('/payments/summary'),
        api.get('/payments/platform-financials').catch(() => ({ data: null })),
      ])
      setSummary(sRes.data || null)
      setPlatform(pRes.data || null)
    } catch (e) {
      setError(typeof e?.response?.data?.detail === 'string' ? e.response.data.detail : 'Could not load summary')
      setSummary(null)
      setPlatform(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const fmt = (n) =>
    `€ ${(typeof n === 'number' && Number.isFinite(n) ? n : Number(n || 0)).toFixed(2)}`

  return (
    <div className="admin-page-main">
      <PageHeader
        title="Dashboard"
        description="Overview of payments and platform metrics. Use the sidebar to manage operations."
      />

      {error ? <p className="banner calendar-error">{error}</p> : null}

      {loading ? (
        <p className="muted">Loading…</p>
      ) : summary ? (
        <div
          className="admin-dashboard"
          style={{ maxWidth: 'none', margin: 0, padding: 0, minHeight: 'auto' }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: '1rem',
              marginBottom: '1.5rem',
            }}
          >
            <StatCard label="Total paid (Stripe)" value={fmt(summary.total_paid)} />
            <StatCard label="Refunded" value={fmt(summary.refunded)} />
            <StatCard label="Cash paid" value={fmt(summary.cash_paid)} />
            <StatCard label="Net" value={fmt(summary.net)} />
          </div>

          {platform ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: '1rem',
                marginBottom: '1.5rem',
              }}
            >
              <StatCard label="Commission revenue" value={fmt(platform.total_commission_revenue)} />
              <StatCard label="Driver payouts" value={fmt(platform.total_driver_payouts)} />
              <StatCard label="Cash commission owed (wallets)" value={fmt(platform.total_cash_commission_owed)} />
            </div>
          ) : null}

          <div className="panel">
            <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.05rem' }}>Quick links</h2>
            <ul style={{ margin: 0, paddingLeft: '1.15rem', color: 'var(--panel-text, #f1f5f9)' }}>
              <li>
                <Link to="../trips" style={{ color: 'var(--accent, #38bdf8)' }}>
                  Trips & assignment
                </Link>
              </li>
              <li>
                <Link to="../drivers" style={{ color: 'var(--accent, #38bdf8)' }}>
                  Drivers & requests
                </Link>
              </li>
              <li>
                <Link to="../tour-instances" style={{ color: 'var(--accent, #38bdf8)' }}>
                  Tour instances & calendar
                </Link>
              </li>
              <li>
                <Link to="../payments" style={{ color: 'var(--accent, #38bdf8)' }}>
                  Payments
                </Link>
              </li>
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  )
}
