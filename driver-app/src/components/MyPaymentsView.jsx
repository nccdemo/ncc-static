import { useCallback, useEffect, useMemo, useState } from 'react'

import api from '../api/axios.js'
import { formatApiDetail } from '../api/client.js'

function formatEUR(v) {
  const n = typeof v === 'number' ? v : Number(v)
  return `€${(Number.isFinite(n) ? n : 0).toFixed(2)}`
}

function formatMethod(m) {
  if (!m) return '—'
  const s = String(m).toLowerCase()
  if (s === 'card') return 'Card'
  if (s === 'cash') return 'Cash'
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function formatDate(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return iso
  }
}

export default function MyPaymentsView({ driverId, onBack }) {
  const [summary, setSummary] = useState(null)
  const [paymentItems, setPaymentItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [summaryRes, paymentsRes] = await Promise.all([
        api.get(`/drivers/${driverId}/payments-summary`),
        api.get(`/drivers/${driverId}/payments`),
      ])
      setSummary(summaryRes.data || null)
      const raw = paymentsRes.data
      const items = Array.isArray(raw?.items) ? raw.items : Array.isArray(raw) ? raw : []
      setPaymentItems(items)
    } catch (e) {
      console.error(e)
      let msg = 'Could not load payments'
      if (e?.code === 'ERR_NETWORK' || e?.message === 'Network Error') {
        msg = 'Network error — check connection and API URL.'
      } else if (e?.response?.data?.detail != null) {
        msg = formatApiDetail(e.response.data.detail)
      } else if (typeof e?.response?.status === 'number') {
        msg = `Request failed (HTTP ${e.response.status}).`
      }
      setError(msg)
      setSummary(null)
      setPaymentItems([])
    } finally {
      setLoading(false)
    }
  }, [driverId])

  useEffect(() => {
    load()
  }, [load])

  const paid = useMemo(
    () => (Array.isArray(summary?.paid_payouts) ? summary.paid_payouts : []),
    [summary],
  )
  const pending = useMemo(
    () => (Array.isArray(summary?.pending_payouts) ? summary.pending_payouts : []),
    [summary],
  )
  const invoices = useMemo(
    () => (Array.isArray(summary?.invoices) ? summary.invoices : []),
    [summary],
  )

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

      <h1 className="sheet-title">My payments</h1>
      <p className="muted sheet-sub">Your ride payments, card batches, and invoices</p>

      {loading && <p className="muted center-pad">Loading…</p>}
      {error && <p className="banner error">{error}</p>}

      {!loading && !error ? (
        <>
          <section className="panel">
            <h2>Your payments</h2>
            <p className="muted-sm" style={{ marginBottom: '0.75rem' }}>
              Amount, method, date, and status for this driver only.
            </p>
            {paymentItems.length === 0 ? (
              <p className="muted">No payments linked to your rides yet</p>
            ) : (
              <ul className="booking-list">
                {paymentItems.map((p) => (
                  <li key={p.id} className="booking-row">
                    <div className="booking-main">
                      <span className="booking-name">{formatEUR(p.amount)}</span>
                      <span className="muted-sm">
                        {formatMethod(p.method)} · {formatDate(p.date)} · {p.status || '—'}
                      </span>
                      {p.booking_id != null ? (
                        <span className="muted-sm">Booking #{p.booking_id}</span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {summary ? (
            <>
              <section className="panel">
                <h2>Card payout totals</h2>
                <div className="service-grid">
                  <div className="service-box">
                    <div className="service-label">Paid out (card)</div>
                    <div className="service-value">{formatEUR(summary.total_earnings_paid)}</div>
                  </div>
                  <div className="service-box">
                    <div className="service-label">In pending batch</div>
                    <div className="service-value">{formatEUR(summary.total_pending_batch)}</div>
                  </div>
                  <div className="service-box">
                    <div className="service-label">Not yet in a batch</div>
                    <div className="service-value">{formatEUR(summary.not_yet_batched_card_net)}</div>
                  </div>
                </div>
                <p className="muted-sm" style={{ marginTop: '0.5rem' }}>
                  Rides not batched: {summary.preview_rides_count ?? 0}
                </p>
              </section>

              <section className="panel">
                <h2>Pending payouts</h2>
                {pending.length === 0 ? (
                  <p className="muted">None</p>
                ) : (
                  <ul className="booking-list">
                    {pending.map((p) => (
                      <li key={p.id} className="booking-row">
                        <div className="booking-main">
                          <span className="booking-name">
                            #{p.id} · {formatEUR(p.amount)} · {p.rides_count} rides
                          </span>
                          <span className="muted-sm">{p.created_at || ''}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="panel">
                <h2>Paid payouts</h2>
                {paid.length === 0 ? (
                  <p className="muted">None yet</p>
                ) : (
                  <ul className="booking-list">
                    {paid.map((p) => (
                      <li key={p.id} className="booking-row">
                        <div className="booking-main">
                          <span className="booking-name">
                            #{p.id} · {formatEUR(p.amount)} · {p.rides_count} rides
                          </span>
                          <span className="muted-sm">{p.paid_at || p.created_at || ''}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="panel">
                <h2>Invoices</h2>
                {invoices.length === 0 ? (
                  <p className="muted">No invoices yet (issued when a batch is confirmed)</p>
                ) : (
                  <ul className="booking-list">
                    {invoices.map((inv) => (
                      <li key={inv.id} className="booking-row">
                        <div className="booking-main">
                          <span className="booking-name">
                            {inv.invoice_number} · {formatEUR(inv.amount)}
                          </span>
                          <span className="muted-sm">{inv.date || ''}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="muted-sm" style={{ marginTop: '0.75rem' }}>
                  PDF download can be added later.
                </p>
              </section>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
