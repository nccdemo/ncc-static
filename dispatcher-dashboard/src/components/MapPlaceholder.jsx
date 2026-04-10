export function MapPlaceholder({ selectedTrip }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">Map (placeholder)</div>
        <div className="text-xs text-slate-400">No maps API yet</div>
      </div>

      {!selectedTrip ? (
        <div className="mt-4 text-sm text-slate-400">
          Select a trip to view coordinates.
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
            <div className="text-xs text-slate-400">Driver</div>
            <div className="mt-1 text-slate-200">
              {selectedTrip.driver?.latitude ?? '—'},{' '}
              {selectedTrip.driver?.longitude ?? '—'}
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
            <div className="text-xs text-slate-400">Pickup</div>
            <div className="mt-1 text-slate-200">
              {selectedTrip.pickup_lat ?? '—'}, {selectedTrip.pickup_lng ?? '—'}
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
            <div className="text-xs text-slate-400">Dropoff</div>
            <div className="mt-1 text-slate-200">
              {selectedTrip.dropoff_lat ?? '—'},{' '}
              {selectedTrip.dropoff_lng ?? '—'}
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
            <div className="text-xs text-slate-400">ETA to pickup</div>
            <div className="mt-1 text-slate-200">
              {selectedTrip.eta_to_pickup_minutes ?? '—'} min
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

