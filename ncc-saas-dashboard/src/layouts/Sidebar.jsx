import { NavLink } from 'react-router-dom'
import {
  BedDouble,
  Calendar,
  Car,
  CreditCard,
  LayoutDashboard,
  MapPin,
  Route,
  Ticket,
  Users,
} from 'lucide-react'

const items = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/trips', label: 'Trips', icon: Route },
  { to: '/drivers', label: 'Drivers', icon: Users },
  { to: '/vehicles', label: 'Vehicles', icon: Car },
  { to: '/custom-rides', label: 'Custom Rides', icon: Ticket },
  { to: '/tours', label: 'Tours', icon: MapPin },
  { to: '/admin/instances', label: 'Tour Instances', icon: Calendar },
  { to: '/admin/dashboard', label: 'Earnings', icon: LayoutDashboard },
  { to: '/admin/payments', label: 'Payments', icon: CreditCard },
  { to: '/admin/bnb', label: 'B&B Affiliati', icon: BedDouble },
]

function Item({ to, label, icon: Icon }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) => (isActive ? 'sidebar-item active' : 'sidebar-item')}
    >
      {({ isActive }) => (
        <>
          <span
            className={isActive ? 'sidebar-active-bar' : 'sidebar-active-bar hover'}
            aria-hidden="true"
          />
          <Icon className="h-4 w-4" />
          <span className="font-medium">{label}</span>
        </>
      )}
    </NavLink>
  )
}

export function Sidebar() {
  return (
    <div className="p-4">
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-3">
        <div className="h-9 w-9 rounded-lg bg-primary" />
        <div className="leading-tight">
          <div className="text-sm font-semibold">NCC SaaS</div>
          <div className="text-xs text-muted-foreground">Console operativa</div>
        </div>
      </div>

      <div className="mt-6 space-y-1">
        {items.map((it) => (
          <Item key={it.to} {...it} />
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
        Pronto per API reali (FastAPI). Nessun mock.
      </div>
    </div>
  )
}

