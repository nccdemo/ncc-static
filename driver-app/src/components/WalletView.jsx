import { useCallback, useEffect, useMemo, useState } from 'react'

import api from '../api/axios.js'
import { formatApiDetail } from '../api/client.js'

function formatEUR(v) {
  const n = typeof v === 'number' ? v : Number(v)
  return `€${(Number.isFinite(n) ? n : 0).toFixed(2)}`
}

function txLabel(tx) {
  const t = String(tx?.type || '')
  if (t === 'cash_in') return 'cash ride'
  if (t === 'payout') return 'payout'
  if (t === 'settlement') return 'settlement'
  if (t === 'adjustment') return 'adjustment'
  return t || '—'
}

export default function WalletView({ driverId, onBack }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data: res } = await api.get(`/drivers/${driverId}/wallet`)
      setData(res || null)
    } catch (e) {
      console.error(e)
      setError(formatApiDetail(e.response?.data?.detail) || 'Could not load wallet')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [driverId])

  useEffect(() => {
    load()
  }, [load])

  const balance = useMemo(() => Number(data?.balance || 0), [data])
  const txs = useMemo(() => (Array.isArray(data?.transactions) ? data.transactions : []), [data])

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

      <h1 className="sheet-title">Wallet</h1>
      <p className="muted sheet-sub">Driver #{driverId}</p>

      {loading && <p className="muted center-pad">Loading…</p>}
      {error && <p className="banner error">{error}</p>}

      {!loading && !error && data ? (
        <>
          <section className="panel">
            <h2>Balance</h2>
            <p className="big-balance">{formatEUR(balance)}</p>
            <p className="muted-sm">Cash commission owed to platform</p>
          </section>

          <section className="panel">
            <h2>Transactions</h2>
            {txs.length === 0 ? (
              <p className="muted">No transactions yet</p>
            ) : (
              <ul className="booking-list">
                {txs.map((tx) => {
                  const amt = Number(tx?.amount || 0)
                  const sign =
                    tx?.type === 'cash_in'
                      ? '+'
                      : tx?.type === 'payout' || tx?.type === 'settlement'
                        ? '-'
                        : ''
                  return (
                    <li key={tx.id} className="booking-row">
                      <div className="booking-main">
                        <span className="booking-name">
                          {sign} {formatEUR(Math.abs(amt))}{' '}
                          {typeof tx?.note === 'string' && tx.note.trim()
                            ? tx.note.trim()
                            : txLabel(tx)}
                        </span>
                        <span className="muted-sm">
                          {tx?.created_at ? new Date(tx.created_at).toLocaleString() : ''}
                        </span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  )
}

