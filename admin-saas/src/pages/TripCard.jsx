export function getStatusColor(status) {
  switch (String(status ?? '').toUpperCase()) {
    case 'SCHEDULED':
      return 'bg-gray-200 text-gray-700'
    case 'ASSIGNED':
      return 'bg-blue-200 text-blue-800'
    case 'EN_ROUTE':
      return 'bg-orange-200 text-orange-800'
    case 'ARRIVED':
      return 'bg-green-200 text-green-800'
    case 'IN_PROGRESS':
      return 'bg-purple-200 text-purple-800'
    case 'COMPLETED':
      return 'bg-green-600 text-white'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

/**
 * @param {{ trip: object, children?: import('react').ReactNode }} props
 */
export function TripCard({ trip, children }) {
  const etaMinutes = Number.isFinite(Number(trip.eta)) ? Math.round(Number(trip.eta)) : null
  const startTs = trip.service_start_time ? new Date(trip.service_start_time) : null
  const endTs = trip.service_end_time ? new Date(trip.service_end_time) : null
  const startKm = Number.isFinite(Number(trip.start_km)) ? Number(trip.start_km) : null
  const endKm = Number.isFinite(Number(trip.end_km)) ? Number(trip.end_km) : null
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-md flex flex-col gap-3.5">
      <div className="flex justify-between items-center gap-2">
        <span
          className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(trip.status)}`}
        >
          {trip.status}
        </span>
        <span className="text-sm text-muted-foreground font-mono">#{trip.id}</span>
      </div>

      <div className="text-lg font-semibold leading-snug">{trip.pickup} → {trip.destination}</div>
      <div className="text-sm">
        {etaMinutes != null ? `Arrivo tra ${etaMinutes} min` : 'ETA —'}
      </div>
      <div className="text-sm text-muted-foreground">Customer: {trip.customer || '—'}</div>

      <div className="rounded-xl border border-border/60 bg-background/40 p-3">
        <div className="text-xs font-semibold text-foreground/80">Servizio</div>
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <div className="space-y-0.5">
            <div className="text-muted-foreground">Inizio servizio</div>
            <div className="font-medium text-foreground/90">
              {startTs ? startTs.toLocaleTimeString() : '—'}
            </div>
          </div>
          <div className="space-y-0.5">
            <div className="text-muted-foreground">Fine servizio</div>
            <div className="font-medium text-foreground/90">
              {endTs ? endTs.toLocaleTimeString() : '—'}
            </div>
          </div>
          <div className="space-y-0.5">
            <div className="text-muted-foreground">KM iniziali</div>
            <div className="font-medium text-foreground/90">{startKm != null ? startKm : '—'}</div>
          </div>
          <div className="space-y-0.5">
            <div className="text-muted-foreground">KM finali</div>
            <div className="font-medium text-foreground/90">{endKm != null ? endKm : '—'}</div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm border-t border-border/60 pt-3">
        <div>👤 {trip.driver?.name || 'No driver'}</div>
        <div>🚐 {trip.vehicle?.name || 'No vehicle'}</div>
      </div>

      {children ? <div className="mt-1">{children}</div> : null}
    </div>
  )
}
