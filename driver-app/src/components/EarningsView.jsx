import { useCallback, useEffect, useState } from 'react'

import api from '../api/axios.js'
import { formatApiDetail } from '../api/client.js'

function formatEUR(v) {
  const n = typeof v === 'number' ? v : Number(v)
  return `€${(Number.isFinite(n) ? n : 0).toFixed(2)}`
}

export default function EarningsView({ driverId, onBack }) {
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await api.get(`/drivers/${driverId}/report`)
      setReport(data || null)
    } catch (e) {
      console.error(e)
      setError(formatApiDetail(e.response?.data?.detail) || 'Could not load earnings')
      setReport(null)
    } finally {
      setLoading(false)
    }
  }, [driverId])

  useEffect(() => {
    load()
  }, [load])

  const r = report || {}

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

      <h1 className="sheet-title">Earnings</h1>
      <p className="muted sheet-sub">Driver #{driverId}</p>

      {loading && <p className="muted center-pad">Loading…</p>}
      {error && <p className="banner error">{error}</p>}

      {!loading && !error && report ? (
        <>
          <section className="panel">
            <h2>Today</h2>
            <p className="big-balance" style={{ marginTop: '0.75rem' }}>
              {formatEUR(r.today_driver_net)}
            </p>
            <p className="muted-sm">Your net today (after platform fee)</p>
            <div className="service-grid" style={{ marginTop: '0.75rem' }}>
              <div className="service-box">
                <div className="service-label">Trip gross today</div>
                <div className="service-value">{formatEUR(r.today_gross_earnings)}</div>
              </div>
              <div className="service-box">
                <div className="service-label">Platform fee today</div>
                <div className="service-value">{formatEUR(r.today_commission_paid)}</div>
              </div>
            </div>
          </section>

          <section className="panel">
            <h2>All time</h2>
            <p className="big-balance">{formatEUR(r.driver_net)}</p>
            <p className="muted-sm">Your net (after platform fees on your rides)</p>
            <div className="service-grid" style={{ marginTop: '0.75rem' }}>
              <div className="service-box">
                <div className="service-label">Trip gross</div>
                <div className="service-value">{formatEUR(r.gross_earnings)}</div>
              </div>
              <div className="service-box">
                <div className="service-label">Platform fees (total)</div>
                <div className="service-value">{formatEUR(r.commission_paid)}</div>
              </div>
              <div className="service-box">
                <div className="service-label">Completed rides</div>
                <div className="service-value">{r.total_rides ?? '—'}</div>
              </div>
            </div>
          </section>

          <section className="panel">
            <h2>Wallet</h2>
            <p className="big-balance">{formatEUR(r.wallet_balance)}</p>
            <p className="muted-sm">Cash commission you owe the platform (from cash rides)</p>
          </section>
        </>
      ) : null}
    </div>
  )
}
