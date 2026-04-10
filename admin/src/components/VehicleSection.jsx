import { useCallback, useEffect, useState } from 'react'
import api from '../api/axios.js'
import Modal from './Modal'

const emptyForm = { name: '', seats: '', plate: '', active: true }

export default function VehicleSection() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/vehicles/')
      setItems(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('Failed to load vehicles', err)
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const openModal = () => {
    setForm(emptyForm)
    setModalOpen(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const seats = Number(form.seats)
    if (!form.name.trim() || !Number.isFinite(seats) || seats < 1) return
    setSubmitting(true)
    try {
      await api.post('/vehicles/', {
        name: form.name.trim(),
        seats,
        plate: form.plate.trim() || null,
        active: Boolean(form.active),
      })
      setModalOpen(false)
      setForm(emptyForm)
      await load()
    } catch (err) {
      console.error('Failed to create vehicle', err)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this vehicle? This cannot be undone.')) return
    setDeletingId(id)
    try {
      await api.delete(`/vehicles/${id}`)
      await load()
    } catch (err) {
      console.error('Failed to delete vehicle', err)
      window.alert('Could not delete the vehicle. It may still be linked to trips or bookings.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Vehicles</h2>
        <div className="panel-head-actions">
          <button type="button" className="btn btn-primary" onClick={openModal}>
            + Add Vehicle
          </button>
        </div>
      </div>

      {loading ? (
        <p className="muted">Loading vehicles…</p>
      ) : items.length === 0 ? (
        <p className="muted">No vehicles yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Plate</th>
                <th>Seats</th>
                <th>Active</th>
                <th className="col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((v) => (
                <tr key={v.id}>
                  <td>{v.name}</td>
                  <td>{v.plate ?? '—'}</td>
                  <td>{v.seats}</td>
                  <td>{v.active ? 'Yes' : 'No'}</td>
                  <td className="col-actions">
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      disabled={deletingId === v.id}
                      onClick={() => handleDelete(v.id)}
                    >
                      {deletingId === v.id ? '…' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modalOpen} title="New vehicle" onClose={() => setModalOpen(false)}>
        <form className="stack-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Name</span>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
              autoComplete="off"
            />
          </label>
          <label className="field">
            <span>Seats</span>
            <input
              type="number"
              min={1}
              value={form.seats}
              onChange={(e) => setForm((f) => ({ ...f, seats: e.target.value }))}
              required
            />
          </label>
          <label className="field">
            <span>Plate</span>
            <input
              value={form.plate}
              onChange={(e) => setForm((f) => ({ ...f, plate: e.target.value }))}
              autoComplete="off"
            />
          </label>
          <label className="field field-inline">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
            />
            <span>Active</span>
          </label>
          <div className="form-actions">
            <button type="button" className="btn" onClick={() => setModalOpen(false)}>
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
