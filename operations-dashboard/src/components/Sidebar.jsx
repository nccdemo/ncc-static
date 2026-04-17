import { NavLink } from 'react-router-dom'

const navLinkClass = ({ isActive }) =>
  [
    'block rounded-lg px-3 py-2 text-sm font-medium transition-colors',
    isActive
      ? 'bg-sky-600/20 text-sky-300 ring-1 ring-sky-600/40'
      : 'text-slate-300 hover:bg-slate-800/80 hover:text-slate-100',
  ].join(' ')

export function Sidebar() {
  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm text-slate-400">NCC Platform</div>
        <div className="text-xl font-semibold tracking-tight">Dispatcher</div>
      </div>

      <nav className="space-y-1 rounded-xl border border-slate-800 bg-slate-950/40 p-2">
        <NavLink to="/dashboard" end className={navLinkClass}>
          Overview
        </NavLink>
        <NavLink to="/dashboard/trips" className={navLinkClass}>
          Trips
        </NavLink>
      </nav>

      <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
        <div className="text-xs uppercase tracking-wide text-slate-400">
          Real-time
        </div>
        <div className="mt-2 text-sm text-slate-200">
          WebSocket: <span className="text-slate-400">/ws/trips</span>
        </div>
      </div>

      <div className="text-xs text-slate-500">
        Minimal dashboard for active trips, drivers, and ETA. Map integration can
        be added later.
      </div>
    </div>
  )
}

