import { Badge } from './Badge.jsx'

function toneForStatus(status) {
  switch (status) {
    case 'PENDING':
      return 'slate'
    case 'ASSIGNED':
      return 'blue'
    case 'ACCEPTED':
      return 'violet'
    case 'EN_ROUTE':
    case 'ARRIVED':
    case 'IN_PROGRESS':
      return 'yellow'
    case 'COMPLETED':
      return 'green'
    case 'CANCELLED':
      return 'red'
    default:
      return 'slate'
  }
}

export function TripsPanel({ trips, selectedTripId, onSelect }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">Active trips</div>
        <div className="text-xs text-slate-400">{trips.length} total</div>
      </div>

      <div className="mt-3 space-y-2">
        {trips.map((t) => {
          const isSelected = String(t.id) === String(selectedTripId)
          return (
            <button
              key={t.id}
              onClick={() => onSelect?.(t)}
              className={[
                'w-full text-left rounded-xl border px-3 py-3 transition',
                isSelected
                  ? 'border-sky-600 bg-sky-950/30'
                  : 'border-slate-800 bg-slate-950/40 hover:bg-slate-900/40',
              ].join(' ')}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="font-medium">Trip #{t.id}</div>
                    <Badge tone={toneForStatus(t.status)}>{t.status}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    Booking #{t.booking?.id} · {t.booking?.customer_name}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-400">ETA</div>
                  <div className="text-sm text-slate-200">
                    {t.eta_to_pickup_minutes ?? '—'} min
                  </div>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg border border-slate-800 bg-slate-950/30 px-2 py-2">
                  <div className="text-slate-400">Driver</div>
                  <div className="text-slate-200">
                    {t.driver ? `${t.driver.name} (#${t.driver.id})` : 'Unassigned'}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/30 px-2 py-2">
                  <div className="text-slate-400">Pickup</div>
                  <div className="text-slate-200">
                    {t.pickup_lat ?? '—'}, {t.pickup_lng ?? '—'}
                  </div>
                </div>
              </div>
            </button>
          )
        })}

        {trips.length === 0 && (
          <div className="text-sm text-slate-400 mt-3">
            No active trips right now.
          </div>
        )}
      </div>
    </div>
  )
}

