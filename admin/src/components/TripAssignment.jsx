import { useCallback, useEffect, useState } from 'react'
import api from '../api/axios.js'

const emptyForm = {
  driver_id: '',
  vehicle_id: '',
  tour_instance_id: '',
  date: '',
}

export default function TripAssignment() {
  const [drivers, setDrivers] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [tourInstances, setTourInstances] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState('')

  const loadRefs = useCallback(async () => {
    setLoading(true)
    setSuccess('')
    try {
      const [dRes, vRes, tRes] = await Promise.all([
        api.get('/drivers/'),
        api.get('/vehicles/'),
        api.get('/tour-instances'),
      ])
      setDrivers(Array.isArray(dRes.data) ? dRes.data : [])
      setVehicles(Array.isArray(vRes.data) ? vRes.data : [])
      setTourInstances(Array.isArray(tRes.data) ? tRes.data : [])
    } catch (err) {
      console.error('Failed to load trip assignment data', err)
      setDrivers([])
      setVehicles([])
      setTourInstances([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadRefs()
  }, [loadRefs])

  const handleSubmit = async (e) => {
    e.preventDefault()
    const driver_id = Number(form.driver_id)
    const vehicle_id = Number(form.vehicle_id)
    const tour_instance_id = Number(form.tour_instance_id)
    if (
      !form.date ||
      !Number.isFinite(driver_id) ||
      !Number.isFinite(vehicle_id) ||
      !Number.isFinite(tour_instance_id)
    ) {
      return
    }
    setSubmitting(true)
    setSuccess('')
    try {
      await api.post('/trips/', {
        driver_id,
        vehicle_id,
        tour_instance_id,
        date: form.date,
      })
      setSuccess('Trip assigned successfully.')
      setForm(emptyForm)
    } catch (err) {
      console.error('Failed to create trip', err)
    } finally {
      setSubmitting(false)
    }
  }

  const tourLabel = (t) => {
    const d = t.date ?? ''
    return `#${t.id} — tour ${t.tour_id}${d ? ` (${d})` : ''}`
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Trip assignment</h2>
        <button type="button" className="btn" onClick={loadRefs} disabled={loading}>
          Refresh lists
        </button>
      </div>

      <p className="muted" style={{ marginTop: 6 }}>
        Service sheet PDF: open{' '}
        <a href="/api/service-sheet/&lt;trip_id&gt;/pdf" target="_blank" rel="noopener noreferrer">
          /api/service-sheet/&lt;trip_id&gt;/pdf
        </a>
      </p>

      {loading ? (
        <p className="muted">Loading drivers, vehicles, and tour instances…</p>
      ) : (
        <form className="stack-form trip-form" onSubmit={handleSubmit}>
          {success ? <p className="banner success">{success}</p> : null}

          <label className="field">
            <span>Driver</span>
            <select
              value={form.driver_id}
              onChange={(e) => setForm((f) => ({ ...f, driver_id: e.target.value }))}
              required
            >
              <option value="">Select driver</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {d.active === false ? ' (inactive)' : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Vehicle</span>
            <select
              value={form.vehicle_id}
              onChange={(e) => setForm((f) => ({ ...f, vehicle_id: e.target.value }))}
              required
            >
              <option value="">Select vehicle</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                  {v.plate ? ` — ${v.plate}` : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Tour instance</span>
            <select
              value={form.tour_instance_id}
              onChange={(e) =>
                setForm((f) => ({ ...f, tour_instance_id: e.target.value }))
              }
              required
            >
              <option value="">Select tour instance</option>
              {tourInstances.map((t) => (
                <option key={t.id} value={t.id}>
                  {tourLabel(t)}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Service date</span>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              required
            />
          </label>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Assigning…' : 'Assign trip'}
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
