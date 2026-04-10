import { useCallback, useEffect, useRef, useState } from 'react'

import api from '../api/axios.js'
import Modal from './Modal'
import './DriverSection.css'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'trips', label: 'Trips' },
  { id: 'earnings', label: 'Earnings' },
  { id: 'wallet', label: 'Wallet' },
  { id: 'documents', label: 'Documents' },
]

function formatEUR(v) {
  const n = Number(v)
  return `€${Number.isFinite(n) ? n.toFixed(2) : '0.00'}`
}

function formatShortDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' })
  } catch {
    return iso
  }
}

function presenceOnline(driver) {
  const lu = driver.last_location_update
  if (!lu) return false
  const age = Date.now() - new Date(lu).getTime()
  return age < 12 * 60 * 1000
}

export default function DriverSection() {
  const [drivers, setDrivers] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [active, setActive] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [approvingId, setApprovingId] = useState(null)
  const [walletByDriverId, setWalletByDriverId] = useState({})
  const [reportByDriverId, setReportByDriverId] = useState({})
  const [payoutAmountByDriverId, setPayoutAmountByDriverId] = useState({})
  const [settleAmountByDriverId, setSettleAmountByDriverId] = useState({})
  const [payoutingId, setPayoutingId] = useState(null)
  const [settlingId, setSettlingId] = useState(null)
  const [payoutCooldownUntilById, setPayoutCooldownUntilById] = useState({})
  const payoutCooldownTimerRef = useRef({})
  const [payoutsByDriverId, setPayoutsByDriverId] = useState({})
  const [previewByDriverId, setPreviewByDriverId] = useState({})
  const [cardPayoutBusyId, setCardPayoutBusyId] = useState(null)
  const [tabByDriverId, setTabByDriverId] = useState({})
  const [tripsAdminByDriverId, setTripsAdminByDriverId] = useState({})
  const tripsFetchStartedRef = useRef(new Set())

  useEffect(() => {
    loadDrivers()
  }, [])

  useEffect(() => {
    if (!showModal) return
    setName('')
    setPhone('')
    setEmail('')
    setActive(true)
  }, [showModal])

  async function loadDrivers() {
    setLoading(true)
    try {
      const { data } = await api.get('/drivers/')
      const raw = Array.isArray(data) ? data : []
      setDrivers(raw)
      try {
        const entries = await Promise.all(
          list.map(async (d) => {
            try {
              const res = await api.get(`/drivers/${d.id}/wallet`)
              return [d.id, res.data]
            } catch {
              return [d.id, null]
            }
          }),
        )
        setWalletByDriverId(Object.fromEntries(entries))
        const reports = await Promise.all(
          list.map(async (d) => {
            try {
              const res = await api.get(`/drivers/${d.id}/report`)
              return [d.id, res.data]
            } catch {
              return [d.id, null]
            }
          }),
        )
        setReportByDriverId(Object.fromEntries(reports))
        const pouts = await Promise.all(
          list.map(async (d) => {
            try {
              const res = await api.get(`/drivers/${d.id}/payouts`)
              return [d.id, Array.isArray(res.data?.items) ? res.data.items : []]
            } catch {
              return [d.id, []]
            }
          }),
        )
        setPayoutsByDriverId(Object.fromEntries(pouts))
      } catch {
        setWalletByDriverId({})
        setReportByDriverId({})
        setPayoutsByDriverId({})
      }
      setTripsAdminByDriverId({})
      tripsFetchStartedRef.current = new Set()
    } catch (err) {
      console.error('Failed to load drivers', err)
      setDrivers([])
    } finally {
      setLoading(false)
    }
  }

  const loadAdminTrips = useCallback(async (driverId) => {
    setTripsAdminByDriverId((prev) => ({
      ...prev,
      [driverId]: { ...(prev[driverId] || {}), loading: true, error: '' },
    }))
    try {
      const { data } = await api.get(`/drivers/${driverId}/trips-admin`)
      setTripsAdminByDriverId((prev) => ({
        ...prev,
        [driverId]: {
          assigned: Array.isArray(data?.assigned) ? data.assigned : [],
          completed: Array.isArray(data?.completed) ? data.completed : [],
          loading: false,
          error: '',
          loaded: true,
        },
      }))
    } catch (err) {
      console.error(err)
      tripsFetchStartedRef.current.delete(driverId)
      setTripsAdminByDriverId((prev) => ({
        ...prev,
        [driverId]: {
          ...(prev[driverId] || {}),
          loading: false,
          error: 'Could not load trips',
          loaded: false,
          assigned: [],
          completed: [],
        },
      }))
    }
  }, [])

  const selectTab = useCallback(
    (driverId, tabId) => {
      setTabByDriverId((prev) => ({ ...prev, [driverId]: tabId }))
      if (tabId === 'overview' || tabId === 'trips') {
        if (!tripsFetchStartedRef.current.has(driverId)) {
          tripsFetchStartedRef.current.add(driverId)
          loadAdminTrips(driverId)
        }
      }
    },
    [loadAdminTrips],
  )

  async function handleCreate(e) {
    e.preventDefault()
    if (!name.trim() || !phone.trim()) return

    const payload = {
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim() ? email.trim() : null,
      is_active: Boolean(active),
    }

    setSubmitting(true)
    try {
      await api.post('/drivers/', payload)
      setShowModal(false)
      await loadDrivers()
    } catch (err) {
      console.error('Failed to create driver', err)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleApprove(id) {
    setApprovingId(id)
    try {
      await api.patch(`/drivers/${id}/activate`)
      await loadDrivers()
    } catch (err) {
      console.error('Failed to approve driver', err)
      const detail = err?.response?.data?.detail
      window.alert(typeof detail === 'string' ? detail : 'Could not approve the driver.')
    } finally {
      setApprovingId(null)
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete driver?')) return

    setDeletingId(id)
    try {
      await api.delete(`/drivers/${id}`)
      await loadDrivers()
    } catch (err) {
      console.error('Failed to delete driver', err)
      window.alert('Could not delete the driver. They may still be assigned to trips.')
    } finally {
      setDeletingId(null)
    }
  }

  async function loadCardPreview(driverId) {
    setCardPayoutBusyId(driverId)
    try {
      const { data } = await api.get(`/drivers/${driverId}/payout-preview`)
      setPreviewByDriverId((prev) => ({ ...(prev || {}), [driverId]: data }))
    } catch (err) {
      console.error(err)
      const detail = err?.response?.data?.detail
      window.alert(typeof detail === 'string' ? detail : 'Preview failed')
    } finally {
      setCardPayoutBusyId(null)
    }
  }

  async function generateCardPayout(driverId) {
    setCardPayoutBusyId(driverId)
    try {
      await api.post(`/drivers/${driverId}/generate-payout`)
      await loadDrivers()
    } catch (err) {
      console.error(err)
      const detail = err?.response?.data?.detail
      window.alert(typeof detail === 'string' ? detail : 'Generate failed')
    } finally {
      setCardPayoutBusyId(null)
    }
  }

  async function confirmCardPayout(driverId, payoutId) {
    setCardPayoutBusyId(driverId)
    try {
      const { data } = await api.post(`/drivers/${driverId}/confirm-payout`, {
        payout_id: payoutId,
      })
      const inv = data?.invoice?.invoice_number
      window.alert(inv ? `Payout confirmed. Invoice ${inv}` : 'Payout confirmed')
      await loadDrivers()
    } catch (err) {
      console.error(err)
      const detail = err?.response?.data?.detail
      window.alert(typeof detail === 'string' ? detail : 'Confirm failed')
    } finally {
      setCardPayoutBusyId(null)
    }
  }

  function isPayoutCoolingDown(driverId) {
    const until = payoutCooldownUntilById?.[driverId]
    return typeof until === 'number' && Date.now() < until
  }

  async function handleSettle(driverId) {
    if (settlingId === driverId || payoutingId === driverId) return

    const raw = settleAmountByDriverId?.[driverId]
    const amount = Number(raw)
    if (!Number.isFinite(amount) || amount <= 0) {
      window.alert('Enter an amount greater than zero.')
      return
    }

    setSettlingId(driverId)
    try {
      const { data } = await api.post(`/drivers/${driverId}/settle-wallet`, {
        amount_received: amount,
      })
      if (data?.note === 'nothing_to_settle') {
        window.alert('Nothing to settle — wallet balance is already zero.')
      } else if (data?.note === 'invalid_amount') {
        window.alert('Invalid amount.')
      } else {
        setSettleAmountByDriverId((prev) => ({ ...(prev || {}), [driverId]: '' }))
        await loadDrivers()
      }
    } catch (err) {
      console.error('Failed to settle wallet', err)
      const detail = err?.response?.data?.detail
      window.alert(typeof detail === 'string' ? detail : 'Could not settle wallet')
    } finally {
      setSettlingId(null)
    }
  }

  async function handlePayout(driverId) {
    if (payoutingId === driverId || isPayoutCoolingDown(driverId) || settlingId === driverId) return

    const raw = payoutAmountByDriverId?.[driverId]
    const amount = Number(raw)
    if (!Number.isFinite(amount) || amount <= 0) return

    setPayoutingId(driverId)
    try {
      await api.post(`/drivers/${driverId}/payout`, { amount })
      setPayoutAmountByDriverId((prev) => ({ ...(prev || {}), [driverId]: '' }))
      const until = Date.now() + 10000
      setPayoutCooldownUntilById((prev) => ({ ...(prev || {}), [driverId]: until }))
      const prevTimer = payoutCooldownTimerRef.current[driverId]
      if (prevTimer != null) window.clearTimeout(prevTimer)
      payoutCooldownTimerRef.current[driverId] = window.setTimeout(() => {
        setPayoutCooldownUntilById((prev) => {
          const next = { ...(prev || {}) }
          delete next[driverId]
          return next
        })
        delete payoutCooldownTimerRef.current[driverId]
      }, 10000)
      await loadDrivers()
    } catch (err) {
      console.error('Failed to pay driver', err)
      const detail = err?.response?.data?.detail
      window.alert(typeof detail === 'string' ? detail : 'Could not process payout')
    } finally {
      setPayoutingId(null)
    }
  }

  function renderOverview(d, tripBlock) {
    const rep = reportByDriverId?.[d.id]
    const v0 = tripBlock?.assigned?.[0]?.vehicle
    return (
      <>
        <h4>Basic info</h4>
        <div className="driver-file-grid">
          <p className="driver-file-kv">
            Email
            <strong>{d.email || '—'}</strong>
          </p>
          <p className="driver-file-kv">
            Account
            <strong>{d.active === false ? 'Inactive' : 'Active'}</strong>
          </p>
          <p className="driver-file-kv">
            Driver status
            <strong>{(d.status || '—').replace(/_/g, ' ')}</strong>
          </p>
          <p className="driver-file-kv">
            Last location
            <strong>
              {d.last_location_update
                ? new Date(d.last_location_update).toLocaleString(undefined, {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })
                : '—'}
            </strong>
          </p>
        </div>
        <h4 style={{ marginTop: '1rem' }}>Vehicle</h4>
        {v0 ? (
          <p className="driver-file-kv" style={{ margin: 0 }}>
            Assigned on latest open trip
            <strong>
              {v0.name}
              {v0.plate ? ` · ${v0.plate}` : ''}
            </strong>
          </p>
        ) : (
          <p className="muted" style={{ margin: 0, fontSize: '0.875rem' }}>
            No vehicle on current open trips. Assign via dispatch when you assign a trip.
          </p>
        )}
        {rep?.total_rides != null ? (
          <p className="muted" style={{ marginTop: '0.75rem', fontSize: '0.8rem' }}>
            Completed rides (lifetime): {rep.total_rides}
          </p>
        ) : null}
      </>
    )
  }

  function renderTrips(d) {
    const block = tripsAdminByDriverId[d.id]
    if (block?.loading) {
      return <p className="muted">Loading trips…</p>
    }
    if (block?.error) {
      return <p className="muted">{block.error}</p>
    }
    const assigned = block?.assigned || []
    const completed = block?.completed || []

    return (
      <>
        <h4>Assigned & open</h4>
        {assigned.length === 0 ? (
          <p className="muted" style={{ marginTop: 0 }}>
            None
          </p>
        ) : (
          <ul className="driver-trip-list">
            {assigned.map((t) => (
              <li key={t.id} className="driver-trip-item">
                <div className="driver-trip-item__route">
                  Trip #{t.id}
                  {t.pickup || t.destination
                    ? ` · ${[t.pickup, t.destination].filter(Boolean).join(' → ')}`
                    : ''}
                </div>
                <div className="driver-trip-item__meta">
                  {t.status} · {formatShortDate(t.service_date)}
                  {t.vehicle?.name ? ` · ${t.vehicle.name}` : ''}
                </div>
              </li>
            ))}
          </ul>
        )}
        <h4 style={{ marginTop: '1.1rem' }}>Completed</h4>
        {completed.length === 0 ? (
          <p className="muted" style={{ marginTop: 0 }}>
            None yet
          </p>
        ) : (
          <ul className="driver-trip-list">
            {completed.map((t) => (
              <li key={t.id} className="driver-trip-item">
                <div className="driver-trip-item__route">
                  Trip #{t.id}
                  {t.pickup || t.destination
                    ? ` · ${[t.pickup, t.destination].filter(Boolean).join(' → ')}`
                    : ''}
                </div>
                <div className="driver-trip-item__meta">
                  {formatShortDate(t.service_date)}
                  {t.vehicle?.name ? ` · ${t.vehicle.name}` : ''}
                </div>
              </li>
            ))}
          </ul>
        )}
      </>
    )
  }

  function renderEarnings(d) {
    const rep = reportByDriverId?.[d.id]
    const pending = Array.isArray(payoutsByDriverId[d.id])
      ? payoutsByDriverId[d.id].filter((p) => (p.status || '').toLowerCase() === 'pending')
      : []

    return (
      <>
        <h4>Totals</h4>
        <div className="driver-file-grid">
          <p className="driver-file-kv">
            Total earnings (driver net)
            <strong>{formatEUR(rep?.driver_net ?? 0)}</strong>
          </p>
          <p className="driver-file-kv">
            Today (driver net)
            <strong>{formatEUR(rep?.today_driver_net ?? 0)}</strong>
          </p>
          <p className="driver-file-kv">
            Today gross
            <strong>{formatEUR(rep?.today_gross_earnings ?? 0)}</strong>
          </p>
          <p className="driver-file-kv">
            Trip gross (all time)
            <strong>{formatEUR(rep?.gross_earnings ?? 0)}</strong>
          </p>
          <p className="driver-file-kv">
            Platform fees paid
            <strong>{formatEUR(rep?.commission_paid ?? 0)}</strong>
          </p>
        </div>

        <h4 style={{ marginTop: '1.1rem' }}>Card payouts (Stripe)</h4>
        <p className="muted" style={{ marginTop: 0, fontSize: '0.8rem' }}>
          Batches are separate from the cash wallet.
        </p>
        <div className="driver-inline-actions">
          <button
            type="button"
            className="btn btn-sm"
            disabled={cardPayoutBusyId === d.id || settlingId === d.id}
            onClick={() => loadCardPreview(d.id)}
          >
            Calculate batch
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            disabled={cardPayoutBusyId === d.id || settlingId === d.id}
            onClick={() => generateCardPayout(d.id)}
          >
            Generate payout
          </button>
        </div>
        {previewByDriverId[d.id] ? (
          <p className="muted" style={{ fontSize: '0.85rem' }}>
            Next batch: {formatEUR(previewByDriverId[d.id].total_payout_amount || 0)} ·{' '}
            {previewByDriverId[d.id].rides_count ?? 0} rides
          </p>
        ) : null}
        <h4 style={{ marginTop: '0.75rem' }}>Payout history</h4>
        {pending.length === 0 && (!payoutsByDriverId[d.id] || payoutsByDriverId[d.id].length === 0) ? (
          <p className="muted" style={{ marginTop: 0 }}>
            None
          </p>
        ) : (
          <ul style={{ margin: '0.35rem 0 0', paddingLeft: '1.1rem', fontSize: '0.875rem' }}>
            {(payoutsByDriverId[d.id] || []).map((p) => (
              <li key={p.id} style={{ marginBottom: '0.35rem' }}>
                #{p.id} · {formatEUR(p.amount)} · {p.status}
                {p.status === 'pending' ? (
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{ marginLeft: '0.5rem' }}
                    disabled={cardPayoutBusyId === d.id || settlingId === d.id}
                    onClick={() => confirmCardPayout(d.id, p.id)}
                  >
                    Confirm payment
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </>
    )
  }

  function renderWallet(d) {
    const rep = reportByDriverId?.[d.id]
    const txs = Array.isArray(walletByDriverId?.[d.id]?.transactions)
      ? walletByDriverId[d.id].transactions
      : []

    return (
      <>
        <h4>Balance</h4>
        <p className="driver-file-kv" style={{ marginBottom: '0.5rem' }}>
          Cash wallet (commission owed)
          <strong style={{ fontSize: '1.25rem' }}>
            {formatEUR(walletByDriverId?.[d.id]?.balance ?? rep?.wallet_balance ?? 0)}
          </strong>
        </p>
        <p className="muted" style={{ margin: '0 0 0.5rem', fontSize: '0.8rem' }}>
          Payout and settle when you move cash with the driver.
        </p>
        <h4>Transactions</h4>
        <div className="driver-wallet-txs">
          {txs.length === 0 ? (
            <span className="muted" style={{ fontSize: '0.85rem' }}>
              No transactions yet
            </span>
          ) : (
            txs.slice(0, 50).map((tx) => (
              <div key={tx.id} className="driver-wallet-tx">
                <span>
                  <strong>{String(tx.type || '—')}</strong>
                  {tx.note ? ` · ${tx.note}` : ''}
                  {tx.ride_id != null ? ` · ride #${tx.ride_id}` : ''}
                </span>
                <span style={{ textAlign: 'right' }}>
                  {formatEUR(tx.amount)}
                  <span className="muted" style={{ marginLeft: '0.35rem', fontSize: '0.75rem' }}>
                    {tx.created_at
                      ? new Date(tx.created_at).toLocaleString(undefined, {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })
                      : ''}
                  </span>
                </span>
              </div>
            ))
          )}
        </div>
        <div className="driver-inline-actions">
          <input
            className="input"
            style={{ width: 120 }}
            type="number"
            step="0.01"
            min="0.01"
            placeholder="Amount"
            aria-label="Payout amount"
            value={payoutAmountByDriverId?.[d.id] ?? ''}
            onChange={(e) =>
              setPayoutAmountByDriverId((prev) => ({ ...(prev || {}), [d.id]: e.target.value }))
            }
            disabled={payoutingId === d.id || isPayoutCoolingDown(d.id) || settlingId === d.id}
          />
          <button
            type="button"
            className="btn btn-sm btn-primary"
            disabled={payoutingId === d.id || isPayoutCoolingDown(d.id) || settlingId === d.id}
            onClick={() => handlePayout(d.id)}
          >
            {payoutingId === d.id ? '…' : isPayoutCoolingDown(d.id) ? 'Wait…' : 'Payout'}
          </button>
        </div>
        <div className="driver-inline-actions">
          <input
            className="input"
            style={{ width: 120 }}
            type="number"
            step="0.01"
            min="0.01"
            placeholder="Received"
            aria-label="Settlement amount"
            value={settleAmountByDriverId?.[d.id] ?? ''}
            onChange={(e) =>
              setSettleAmountByDriverId((prev) => ({ ...(prev || {}), [d.id]: e.target.value }))
            }
            disabled={settlingId === d.id || payoutingId === d.id}
          />
          <button
            type="button"
            className="btn btn-sm"
            disabled={settlingId === d.id || payoutingId === d.id}
            onClick={() => handleSettle(d.id)}
          >
            {settlingId === d.id ? '…' : 'Settle'}
          </button>
        </div>
      </>
    )
  }

  function renderDocuments() {
    return (
      <div className="driver-doc-grid">
        <div className="driver-doc-card">
          <h5>Driver license</h5>
          <p>Not stored in the system yet. Upload and verification can be added later.</p>
        </div>
        <div className="driver-doc-card">
          <h5>Insurance</h5>
          <p>Policy documents can be attached here in a future release.</p>
        </div>
      </div>
    )
  }

  return (
    <section className="panel driver-section">
      <div className="panel-head">
        <h2>Drivers</h2>
        <div className="panel-head-actions">
          <button type="button" className="btn btn-primary" onClick={() => setShowModal(true)}>
            + Add driver
          </button>
        </div>
      </div>

      {loading ? (
        <p className="muted">Loading drivers…</p>
      ) : drivers.length === 0 ? (
        <p className="muted">No drivers yet</p>
      ) : (
        <div className="driver-file-stack">
          {drivers.map((d) => {
            const tab = tabByDriverId[d.id] || 'overview'
            const online = presenceOnline(d)
            const busy = String(d.status || '').toLowerCase() === 'on_trip'
            const tripBlock = tripsAdminByDriverId[d.id]
            const accountActive = Boolean(d.is_active ?? d.active)

            return (
              <article key={d.id} className="driver-file-card">
                <header className="driver-file-card__header">
                  <div className="driver-file-card__title">
                    <h3>{d.name}</h3>
                    <p className="driver-file-card__phone">{d.phone}</p>
                  </div>
                  <div className="driver-file-card__meta">
                    <span
                      className={`driver-presence ${online ? 'driver-presence--online' : 'driver-presence--offline'}`}
                      title={d.last_location_update || 'No recent location'}
                    >
                      {online ? 'Online' : 'Offline'}
                    </span>
                    {busy ? (
                      <span className="driver-presence driver-presence--busy" title="Driver status">
                        On trip
                      </span>
                    ) : null}
                    <span
                      className={`driver-presence driver-presence--status${accountActive ? ' driver-presence--online' : ''}`}
                      title="Account approval"
                    >
                      {accountActive ? 'Active' : 'Pending'}
                    </span>
                    {!accountActive ? (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={
                          approvingId === d.id ||
                          deletingId === d.id ||
                          payoutingId === d.id ||
                          settlingId === d.id
                        }
                        onClick={() => handleApprove(d.id)}
                      >
                        {approvingId === d.id ? '…' : 'Approve'}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      disabled={
                        deletingId === d.id ||
                        payoutingId === d.id ||
                        settlingId === d.id ||
                        approvingId === d.id
                      }
                      onClick={() => handleDelete(d.id)}
                    >
                      {deletingId === d.id ? '…' : 'Delete'}
                    </button>
                  </div>
                </header>

                <div className="driver-file-tabs" role="tablist" aria-label={`Sections for ${d.name}`}>
                  {TABS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      role="tab"
                      aria-selected={tab === t.id}
                      className={`driver-file-tab${tab === t.id ? ' is-active' : ''}`}
                      onClick={() => selectTab(d.id, t.id)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                <div className="driver-file-panel" role="tabpanel">
                  {tab === 'overview' && renderOverview(d, tripBlock)}
                  {tab === 'trips' && renderTrips(d)}
                  {tab === 'earnings' && renderEarnings(d)}
                  {tab === 'wallet' && renderWallet(d)}
                  {tab === 'documents' && renderDocuments()}
                </div>
              </article>
            )
          })}
        </div>
      )}

      <Modal open={showModal} title="New driver" onClose={() => setShowModal(false)}>
        <form className="stack-form" onSubmit={handleCreate}>
          <label className="field">
            <span>Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
              disabled={submitting}
            />
          </label>
          <label className="field">
            <span>Phone</span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              autoComplete="tel"
              disabled={submitting}
            />
          </label>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              name="email"
              placeholder="Email"
              value={email || ''}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              disabled={submitting}
            />
          </label>
          <label className="field field-inline">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              disabled={submitting}
            />
            <span>Active account (can sign in)</span>
          </label>
          <div className="form-actions">
            <button type="button" className="btn" onClick={() => setShowModal(false)} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </Modal>
    </section>
  )
}
