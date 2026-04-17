import { useCallback, useEffect, useState } from 'react'

import api from '../api/axios.js'
import { formatApiDetail } from '../api/client.js'

function formatEUR(v) {
  const n = typeof v === 'number' ? v : Number(v)
  return `€${(Number.isFinite(n) ? n : 0).toFixed(2)}`
}

export default function EarningsView({ driverId, onBack }) {
  const [wallet, setWallet] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await api.get(`/drivers/${driverId}/wallet`)
      setWallet(data || null)
    } catch (e) {
      console.error(e)
      setError(formatApiDetail(e.response?.data?.detail) || 'Could not load earnings')
      setWallet(null)
    } finally {
      setLoading(false)
    }
  }, [driverId])

  useEffect(() => {
    load()
  }, [load])

  const w = wallet || {}
  const totalEarnings = Number(w.total_earnings ?? 0)
  const tripsCount = Number(w.trips_count ?? 0)
  const pendingPayouts = Number(w.pending_payouts ?? 0)
  const pendingCount = Number(w.pending_payouts_count ?? 0)
  const cashBalance = Number(w.balance ?? 0)
  const txs = Array.isArray(w.transactions) ? w.transactions : []

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

      <h1 className="sheet-title">Guadagni</h1>
      <p className="muted sheet-sub">Panoramica da portafoglio NCC</p>

      {loading && <p className="muted center-pad">Caricamento…</p>}
      {error && <p className="banner error">{error}</p>}

      {!loading && !error && wallet ? (
        <>
          <section className="service-grid" style={{ marginTop: '0.75rem' }}>
            <div className="service-box">
              <div className="service-label">Guadagni totali (netto)</div>
              <div className="service-value">{formatEUR(totalEarnings)}</div>
              <p className="muted-sm" style={{ margin: '0.35rem 0 0', fontSize: '0.8rem' }}>
                Da pagamenti sui tuoi viaggi (al netto commissioni piattaforma)
              </p>
            </div>
            <div className="service-box">
              <div className="service-label">Viaggi completati</div>
              <div className="service-value">{Number.isFinite(tripsCount) ? tripsCount : '—'}</div>
            </div>
            <div className="service-box">
              <div className="service-label">Pagamenti in sospeso</div>
              <div className="service-value">{formatEUR(pendingPayouts)}</div>
              <p className="muted-sm" style={{ margin: '0.35rem 0 0', fontSize: '0.8rem' }}>
                {pendingCount > 0
                  ? `${pendingCount} batch in attesa di conferma / bonifico`
                  : 'Nessun batch in sospeso'}
              </p>
            </div>
          </section>

          <section className="panel" style={{ marginTop: '1rem' }}>
            <h2>Wallet cash</h2>
            <p className="big-balance" style={{ marginTop: '0.5rem' }}>
              {formatEUR(cashBalance)}
            </p>
            <p className="muted-sm">Commissioni cash da versare alla piattaforma (se applicabile)</p>
          </section>

          {txs.length > 0 ? (
            <section className="panel" style={{ marginTop: '1rem' }}>
              <h2>Movimenti wallet</h2>
              <ul className="muted-sm" style={{ margin: '0.5rem 0 0', paddingLeft: '1.1rem' }}>
                {txs.slice(0, 12).map((t) => (
                  <li key={t.id} style={{ marginBottom: '0.35rem' }}>
                    <strong>{formatEUR(t.amount)}</strong>
                    {t.type ? ` · ${t.type}` : ''}
                    {t.created_at ? ` · ${t.created_at}` : ''}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
