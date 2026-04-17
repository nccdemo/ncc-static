import { Button } from '../components/ui/button.jsx'

function isAssignedOrBeyond(trip) {
  const s = String(trip.status || '').toUpperCase()
  if (trip?.raw?.driver_id != null) return true
  return ['ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED'].includes(s)
}

export function resolveDriverId(trip, assignState) {
  const row = assignState[trip.id]
  if (row && Object.prototype.hasOwnProperty.call(row, 'driver_id')) {
    return row.driver_id
  }
  const id = trip.raw?.driver_id ?? trip.driver?.id
  return id != null ? String(id) : ''
}

export function resolveVehicleId(trip, assignState) {
  const row = assignState[trip.id]
  if (row && Object.prototype.hasOwnProperty.call(row, 'vehicle_id')) {
    return row.vehicle_id
  }
  const id = trip.raw?.vehicle_id ?? trip.vehicle?.id
  return id != null ? String(id) : ''
}

function resolveStartKm(trip, assignState) {
  const row = assignState[trip.id]
  if (row && Object.prototype.hasOwnProperty.call(row, 'start_km')) {
    return row.start_km ?? ''
  }
  return trip.start_km != null ? String(trip.start_km) : ''
}

function resolveEndKm(trip, assignState) {
  const row = assignState[trip.id]
  if (row && Object.prototype.hasOwnProperty.call(row, 'end_km')) {
    return row.end_km ?? ''
  }
  return trip.end_km != null ? String(trip.end_km) : ''
}

/**
 * @param {{
 *   trip: object
 *   drivers: object[]
 *   vehicles: object[]
 *   assignState: Record<string, { driver_id?: string, vehicle_id?: string, start_km?: string, end_km?: string }>
 *   setAssignState: import('react').Dispatch<import('react').SetStateAction<Record<string, object>>>
 *   onAssign: (tripId: string | number) => void
 *   onUpdateKm: (tripId: string | number, payload: { start_km: number | null, end_km: number | null }) => void
 *   onStartService: (tripId: string | number) => void
 *   onEndService: (tripId: string | number) => void
 *   onReassign: (tripId: string | number) => void
 *   onCancel: (tripId: string | number) => void
 *   actionLoadingId: string | number | null
 *   controlsDisabled?: boolean
 * }} props
 */
export function AssignControls({
  trip,
  drivers,
  vehicles,
  assignState,
  setAssignState,
  onAssign,
  onUpdateKm,
  onStartService,
  onEndService,
  onReassign,
  onCancel,
  actionLoadingId,
  controlsDisabled = false,
}) {
  const tripBusy = actionLoadingId != null && String(actionLoadingId) === String(trip.id)
  const driverValue = resolveDriverId(trip, assignState)
  const vehicleValue = resolveVehicleId(trip, assignState)
  const startKmValue = resolveStartKm(trip, assignState)
  const endKmValue = resolveEndKm(trip, assignState)
  const blocked = isAssignedOrBeyond(trip)
  const assignDisabled =
    controlsDisabled ||
    tripBusy ||
    !driverValue ||
    blocked ||
    drivers.length === 0

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <Button variant="outline" size="sm" asChild>
        <a href={`/api/service-sheet/${trip.id}/pdf`} target="_blank" rel="noopener noreferrer">
          📄 PDF
        </a>
      </Button>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={controlsDisabled || tripBusy}
          onClick={() => onStartService(trip.id)}
        >
          Inizia servizio
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={controlsDisabled || tripBusy || !trip.service_start_time}
          onClick={() => onEndService(trip.id)}
        >
          Termina servizio
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">Start KM</span>
          <input
            inputMode="decimal"
            type="number"
            step="0.1"
            value={startKmValue}
            onChange={(e) => {
              const value = e.target.value
              setAssignState((prev) => ({
                ...prev,
                [trip.id]: { ...(prev[trip.id] || {}), start_km: value },
              }))
            }}
            onBlur={() => {
              const startRaw = resolveStartKm(trip, assignState)
              const endRaw = resolveEndKm(trip, assignState)
              const start = startRaw === '' ? null : Number(startRaw)
              const end = endRaw === '' ? null : Number(endRaw)
              onUpdateKm(trip.id, {
                start_km: Number.isFinite(start) ? start : null,
                end_km: Number.isFinite(end) ? end : null,
              })
            }}
            disabled={controlsDisabled || tripBusy}
            className="h-8 w-[6.5rem] rounded-md border border-input bg-background px-2 text-xs"
            placeholder="—"
          />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">End KM</span>
          <input
            inputMode="decimal"
            type="number"
            step="0.1"
            value={endKmValue}
            onChange={(e) => {
              const value = e.target.value
              setAssignState((prev) => ({
                ...prev,
                [trip.id]: { ...(prev[trip.id] || {}), end_km: value },
              }))
            }}
            onBlur={() => {
              const startRaw = resolveStartKm(trip, assignState)
              const endRaw = resolveEndKm(trip, assignState)
              const start = startRaw === '' ? null : Number(startRaw)
              const end = endRaw === '' ? null : Number(endRaw)
              onUpdateKm(trip.id, {
                start_km: Number.isFinite(start) ? start : null,
                end_km: Number.isFinite(end) ? end : null,
              })
            }}
            disabled={controlsDisabled || tripBusy}
            className="h-8 w-[6.5rem] rounded-md border border-input bg-background px-2 text-xs"
            placeholder="—"
          />
        </div>
      </div>

      <select
        value={driverValue}
        onChange={(e) => {
          const value = e.target.value
          setAssignState((prev) => ({
            ...prev,
            [trip.id]: { ...(prev[trip.id] || {}), driver_id: value },
          }))
        }}
        disabled={controlsDisabled || tripBusy || drivers.length === 0}
        className="h-8 rounded-md border border-input bg-background px-2 text-xs min-w-[8rem]"
      >
        <option value="">Driver</option>
        {drivers.map((d) => (
          <option key={d.id} value={String(d.id)}>
            {d.name || `Driver #${d.id}`}
          </option>
        ))}
      </select>

      <select
        value={vehicleValue}
        onChange={(e) => {
          const value = e.target.value
          setAssignState((prev) => ({
            ...prev,
            [trip.id]: { ...(prev[trip.id] || {}), vehicle_id: value },
          }))
        }}
        disabled={controlsDisabled || tripBusy || vehicles.length === 0}
        className="h-8 rounded-md border border-input bg-background px-2 text-xs min-w-[8rem]"
      >
        <option value="">Vehicle</option>
        {vehicles.map((v) => (
          <option key={v.id} value={String(v.id)}>
            {v.name || `Vehicle #${v.id}`}
          </option>
        ))}
      </select>

      <Button
        size="sm"
        className="bg-blue-600 text-white hover:bg-blue-700"
        disabled={assignDisabled}
        onClick={() => onAssign(trip.id)}
      >
        {tripBusy ? '…' : 'Assign'}
      </Button>

      <Button
        size="sm"
        className="bg-yellow-500 text-white hover:bg-yellow-600"
        disabled={controlsDisabled || tripBusy}
        onClick={() => onReassign(trip.id)}
      >
        Reassign
      </Button>

      <Button
        size="sm"
        variant="destructive"
        disabled={controlsDisabled || tripBusy}
        onClick={() => onCancel(trip.id)}
      >
        Cancel
      </Button>
    </div>
  )
}
