import { Badge } from './Badge.jsx'

function driverTone(active) {
  return active ? 'green' : 'red'
}

export function DriversPanel({ drivers }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/30 p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">Drivers</div>
        <div className="text-xs text-slate-400">{drivers.length} total</div>
      </div>

      <div className="mt-3 space-y-2">
        {drivers.map((d) => (
          <div
            key={d.id}
            className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <div className="font-medium">
                    {d.name} <span className="text-slate-500">#{d.id}</span>
                  </div>
                  <Badge tone={driverTone(d.active)}>
                    {d.active ? 'ACTIVE' : 'INACTIVE'}
                  </Badge>
                </div>
                <div className="mt-1 text-xs text-slate-400">{d.phone}</div>
              </div>
              <div className="text-right text-xs">
                <div className="text-slate-400">Location</div>
                <div className="text-slate-200">
                  {d.latitude ?? '—'}, {d.longitude ?? '—'}
                </div>
              </div>
            </div>
          </div>
        ))}

        {drivers.length === 0 && (
          <div className="text-sm text-slate-400 mt-3">No drivers found.</div>
        )}
      </div>
    </div>
  )
}

