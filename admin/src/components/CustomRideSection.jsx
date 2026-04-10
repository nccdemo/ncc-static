import { useState } from 'react'

import api from '../api/axios.js'
import Modal from './Modal'

const emptyForm = {
  pickup: '',
  destination: '',
  date: '',
  time: '',
  price: '',
  email: '',
}

export default function CustomRideSection() {
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const open = () => {
    setResult(null)
    setError('')
    setForm(emptyForm)
    setModalOpen(true)
  }

  const close = () => setModalOpen(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.pickup.trim() || !form.destination.trim() || !form.date || !form.time) return
    const price = Number(form.price)
    if (!Number.isFinite(price) || price <= 0) return
    if (!form.email.trim()) return

    setSubmitting(true)
    setError('')
    try {
      const { data } = await api.post('/bookings/custom-ride', {
        pickup: form.pickup.trim(),
        destination: form.destination.trim(),
        date: form.date,
        time: form.time,
        price,
        email: form.email.trim(),
      })
      setResult(data)
    } catch (err) {
      console.error('Failed to create custom ride', err)
      setError(err?.response?.data?.detail ?? err?.message ?? 'Could not create custom ride')
    } finally {
      setSubmitting(false)
    }
  }

  const quoteUrl = result?.booking_id
    ? `${window.location.origin}/quote/${result.booking_id}`
    : null

  return (
    <div style={{ background: 'red', padding: '20px', color: 'white' }}>
      <h2>Custom Ride Section</h2>
      <section className="panel">
      <div className="panel-head">
        <h2>Custom booking</h2>
        <div className="panel-head-actions">
          <button type="button" className="btn btn-primary" onClick={open}>
            Create Custom Ride
          </button>
        </div>
      </div>

      <p className="muted">
        Create a one-off ride and send a payment link to the client.
      </p>

      {result?.booking_id ? (
        <div className="driver-list" style={{ marginTop: '0.85rem' }}>
          <div className="row">
            <div className="row-main">
              <div>
                <strong>Booking #{result.booking_id}</strong>
              </div>
              <div className="row-sub">Payment link</div>
            </div>
            {quoteUrl ? (
              <button
                type="button"
                className="btn btn-sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(quoteUrl)
                    window.alert('Payment link copied')
                  } catch {
                    window.prompt('Copy payment link', quoteUrl)
                  }
                }}
              >
                Copy link
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <Modal open={modalOpen} title="Create custom ride" onClose={close}>
        <form className="stack-form" onSubmit={handleSubmit}>
          {error ? <p className="banner error">{error}</p> : null}

          <label className="field">
            <span>Pickup</span>
            <input
              value={form.pickup}
              onChange={(e) => setForm((f) => ({ ...f, pickup: e.target.value }))}
              required
              autoComplete="off"
              disabled={submitting}
            />
          </label>
          <label className="field">
            <span>Destination</span>
            <input
              value={form.destination}
              onChange={(e) => setForm((f) => ({ ...f, destination: e.target.value }))}
              required
              autoComplete="off"
              disabled={submitting}
            />
          </label>
          <div className="field" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <label className="field" style={{ margin: 0 }}>
              <span>Date</span>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                required
                disabled={submitting}
              />
            </label>
            <label className="field" style={{ margin: 0 }}>
              <span>Time</span>
              <input
                type="time"
                value={form.time}
                onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                required
                disabled={submitting}
              />
            </label>
          </div>
          <label className="field">
            <span>Price (EUR)</span>
            <input
              type="number"
              min={1}
              step="0.01"
              value={form.price}
              onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
              required
              disabled={submitting}
            />
          </label>
          <label className="field">
            <span>Client email</span>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              required
              autoComplete="email"
              disabled={submitting}
            />
          </label>

          <div className="form-actions">
            <button type="button" className="btn" onClick={close} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>
      </section>
    </div>
  )
}

