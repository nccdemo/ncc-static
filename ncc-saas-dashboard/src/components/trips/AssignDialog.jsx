import { useEffect, useMemo, useState } from 'react'

import { assignTrip, getAvailableDrivers, getVehicles } from '../../lib/api.js'
import { Button } from '../ui/button.jsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog.jsx'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select.jsx'

export function AssignDialog({ open, onOpenChange, tripId, onSuccess }) {
  const [drivers, setDrivers] = useState([])
  const [loadingDrivers, setLoadingDrivers] = useState(false)
  const [vehicles, setVehicles] = useState([])
  const [loadingVehicles, setLoadingVehicles] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const [driverId, setDriverId] = useState('')
  const [vehicleId, setVehicleId] = useState('')

  const canSubmit = String(driverId).trim().length > 0 && !submitting

  const driverOptions = useMemo(() => {
    return (drivers ?? []).map((d) => ({
      id: d.id,
      label: `${d.name} (#${d.id})`,
    }))
  }, [drivers])

  const vehicleOptions = useMemo(() => {
    return (vehicles ?? []).map((v) => ({
      id: v.id,
      label: v?.name ? `${v.name} (#${v.id})` : `Vehicle ${v.id}`,
    }))
  }, [vehicles])

  async function loadDrivers() {
    setLoadingDrivers(true)
    setError(null)
    try {
      const res = await getAvailableDrivers()
      setDrivers(Array.isArray(res.data) ? res.data : [])
      if (Array.isArray(res.data) && res.data.length === 1) {
        setDriverId(String(res.data[0].id))
      }
    } catch (e) {
      setError(e?.message ?? 'Errore caricamento drivers')
    } finally {
      setLoadingDrivers(false)
    }
  }

  async function loadVehicles() {
    setLoadingVehicles(true)
    setError(null)
    try {
      const res = await getVehicles()
      setVehicles(Array.isArray(res.data) ? res.data : [])
    } catch (e) {
      setError(e?.message ?? 'Errore caricamento veicoli')
    } finally {
      setLoadingVehicles(false)
    }
  }

  useEffect(() => {
    if (!open) return
    setDrivers([])
    setVehicles([])
    setDriverId('')
    setVehicleId('')
    loadDrivers()
    loadVehicles()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tripId])

  async function onSubmit(e) {
    e.preventDefault()
    if (!tripId) return

    setSubmitting(true)
    setError(null)
    try {
      const payload = {
        driver_id: Number(driverId),
        vehicle_id: String(vehicleId).trim() ? Number(vehicleId) : null,
      }
      const res = await assignTrip(tripId, payload)
      onOpenChange(false)
      onSuccess?.(res?.data)
    } catch (e) {
      setError(e?.response?.data?.detail ?? e?.message ?? 'Errore assegnazione')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-visible">
        <DialogHeader>
          <DialogTitle>Assign trip</DialogTitle>
          <DialogDescription>
            Seleziona un driver disponibile e (opzionale) un veicolo.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-medium">Driver</div>
            <Select
              value={driverId}
              onValueChange={(v) => setDriverId(v)}
              disabled={loadingDrivers || submitting}
            >
              <SelectTrigger>
                <SelectValue placeholder={loadingDrivers ? 'Loading drivers...' : 'Select a driver'} />
              </SelectTrigger>
              <SelectContent className="z-[9999]">
                {driverOptions.map((d) => (
                  <SelectItem key={d.id} value={String(d.id)}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="text-xs text-muted-foreground">
              Endpoint: <span className="font-mono">GET /api/dispatch/drivers/available</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">Vehicle (optional)</div>
            <Select
              value={vehicleId}
              onValueChange={(v) => setVehicleId(v)}
              disabled={loadingVehicles || submitting}
            >
              <SelectTrigger>
                <SelectValue placeholder={loadingVehicles ? 'Loading vehicles...' : 'Select a vehicle'} />
              </SelectTrigger>
              <SelectContent className="z-[9999]">
                <SelectItem value="none" disabled>
                  No vehicle
                </SelectItem>
                {vehicleOptions.map((v) => (
                  <SelectItem key={v.id} value={String(v.id)}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="text-xs text-muted-foreground">
              Endpoint: <span className="font-mono">GET /api/vehicles/</span>
            </div>
          </div>

          {error ? <div className="text-sm text-red-300">{error}</div> : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Close
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {submitting ? 'Assigning...' : 'Assign'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

