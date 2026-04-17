import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api.js'

function fieldClass(disabled) {
  return [
    'w-full rounded-lg border bg-slate-950/60 px-3 py-2 text-sm text-slate-100',
    'border-slate-700 placeholder:text-slate-500',
    'focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500/40',
    disabled ? 'opacity-60 cursor-not-allowed' : '',
  ].join(' ')
}

export function DashboardTripsPage() {
  const [customerName, setCustomerName] = useState('')
  const [pickup, setPickup] = useState('')
  const [dropoff, setDropoff] = useState('')
  const [datetimeLocal, setDatetimeLocal] = useState('')
  const [creating, setCreating] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [drivers, setDrivers] = useState([])
  const [driversLoading, setDriversLoading] = useState(false)
  const [createdTripId, setCreatedTripId] = useState(null)
  const [selectedDriverId, setSelectedDriverId] = useState('')
  const [banner, setBanner] = useState(null)
  const [error, setError] = useState(null)

  const loadDrivers = useCallback(async () => {
    setDriversLoading(true)
    setError(null)
    try {
      const { data } = await api.get('/drivers/')
      setDrivers(Array.isArray(data) ? data : [])
    } catch (e) {
      setDrivers([])
      setError(e?.response?.data?.detail ?? e?.message ?? 'Failed to load drivers')
    } finally {
      setDriversLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDrivers()
  }, [loadDrivers])

  const onCreateTrip = async (e) => {
    e.preventDefault()
    setError(null)
    setBanner(null)
    setCreating(true)
    try {
      const { data } = await api.post('/trips/', {
        customer_name: customerName.trim(),
        pickup: pickup.trim(),
        dropoff: dropoff.trim(),
        datetime: datetimeLocal,
      })
      const id = data?.id
      if (id == null) {
        throw new Error('Invalid response: missing trip id')
      }
      setCreatedTripId(Number(id))
      setSelectedDriverId('')
      setBanner('Trip created successfully. Select a driver and assign.')
      await loadDrivers()
    } catch (e) {
      const detail = e?.response?.data?.detail
      const msg = Array.isArray(detail)
        ? detail.map((d) => d.msg ?? JSON.stringify(d)).join(' ')
        : typeof detail === 'string'
          ? detail
          : e?.message ?? 'Create trip failed'
      setError(msg)
    } finally {
      setCreating(false)
    }
  }

  const onAssignDriver = async () => {
    if (!createdTripId || !selectedDriverId) return
    setError(null)
    setAssigning(true)
    try {
      await api.post(`/trips/${createdTripId}/assign`, {
        driver_id: Number(selectedDriverId),
      })
      setBanner(`Driver assigned successfully (trip #${createdTripId}).`)
    } catch (e) {
      const detail = e?.response?.data?.detail
      const msg =
        typeof detail === 'string' ? detail : e?.message ?? 'Assign driver failed'
      setError(msg)
    } finally {
      setAssigning(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-100">Create & assign trip</h1>
        <p className="mt-1 text-sm text-slate-400">
          Create a manual transfer, then assign it to a driver.
        </p>
      </div>

      {banner && (
        <div
          className="rounded-lg border border-emerald-800/80 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-100"
          role="status"
        >
          {banner}
        </div>
      )}

      {error && (
        <div
          className="rounded-lg border border-red-900/70 bg-red-950/40 px-3 py-2 text-sm text-red-100"
          role="alert"
        >
          {error}
        </div>
      )}

      <form onSubmit={onCreateTrip} className="max-w-xl space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
            Customer name
          </label>
          <input
            className={fieldClass(creating)}
            value={customerName}
            onChange={(ev) => setCustomerName(ev.target.value)}
            placeholder="e.g. Mario Rossi"
            required
            disabled={creating}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
            Pickup
          </label>
          <input
            className={fieldClass(creating)}
            value={pickup}
            onChange={(ev) => setPickup(ev.target.value)}
            placeholder="Pickup address"
            required
            disabled={creating}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
            Dropoff
          </label>
          <input
            className={fieldClass(creating)}
            value={dropoff}
            onChange={(ev) => setDropoff(ev.target.value)}
            placeholder="Destination address"
            required
            disabled={creating}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
            Date & time
          </label>
          <input
            type="datetime-local"
            className={fieldClass(creating)}
            value={datetimeLocal}
            onChange={(ev) => setDatetimeLocal(ev.target.value)}
            required
            disabled={creating}
          />
        </div>
        <button
          type="submit"
          disabled={creating}
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
        >
          {creating ? 'Creating…' : 'Create Trip'}
        </button>
      </form>

      {createdTripId != null && (
        <section className="max-w-xl space-y-3 border-t border-slate-800 pt-6">
          <div className="text-sm font-medium text-slate-200">
            Trip <span className="text-sky-400">#{createdTripId}</span> — assign driver
          </div>
          {driversLoading ? (
            <div className="text-sm text-slate-400">Loading drivers…</div>
          ) : (
            <>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                Driver
              </label>
              <select
                className={fieldClass(assigning)}
                value={selectedDriverId}
                onChange={(ev) => setSelectedDriverId(ev.target.value)}
                disabled={assigning}
              >
                <option value="">Select driver…</option>
                {drivers.map((d) => (
                  <option key={d.id} value={String(d.id)}>
                    {d.name} (#{d.id})
                    {d.active === false ? ' — inactive' : ''}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={onAssignDriver}
                disabled={assigning || !selectedDriverId}
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
              >
                {assigning ? 'Assigning…' : 'Assign Driver'}
              </button>
            </>
          )}
        </section>
      )}
    </div>
  )
}

export default DashboardTripsPage
