import { NavLink } from 'react-router-dom'
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings'
import BookOnlineIcon from '@mui/icons-material/BookOnline'
import BusinessIcon from '@mui/icons-material/Business'
import DashboardIcon from '@mui/icons-material/Dashboard'
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar'
import PaymentIcon from '@mui/icons-material/Payment'
import PersonIcon from '@mui/icons-material/Person'
import AltRouteIcon from '@mui/icons-material/AltRoute'
import { useAuth } from '../context/AuthContext.jsx'

const adminItems = [
  { to: '/', label: 'Dashboard', icon: DashboardIcon },
  { to: '/trips', label: 'Trips', icon: AltRouteIcon },
  { to: '/bookings', label: 'Bookings', icon: BookOnlineIcon },
  { to: '/drivers', label: 'Drivers', icon: PersonIcon },
  { to: '/vehicles', label: 'Vehicles', icon: DirectionsCarIcon },
  { to: '/admin/bnb', label: 'BNB', icon: BusinessIcon },
  { to: '/admin/payments', label: 'Payments', icon: PaymentIcon },
  { to: '/admin-control', label: 'Admin Control', icon: AdminPanelSettingsIcon },
]

const companyItems = [
  { to: '/', label: 'Dashboard', icon: DashboardIcon },
  { to: '/trips', label: 'My Trips', icon: AltRouteIcon },
  { to: '/bookings', label: 'My Bookings', icon: BookOnlineIcon },
  { to: '/tours', label: 'My Tours', icon: BusinessIcon },
  { to: '/drivers', label: 'My Drivers', icon: PersonIcon },
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
          <Icon fontSize="small" />
          <span className="font-medium">{label}</span>
        </>
      )}
    </NavLink>
  )
}

export function Sidebar() {
  const { role } = useAuth()
  const items = role === 'admin' ? adminItems : companyItems

  return (
    <div className="p-4">
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-3">
        <div className="h-9 w-9 rounded-lg bg-primary" />
        <div className="leading-tight">
          <div className="text-sm font-semibold">NCC SaaS</div>
          <div className="text-xs text-muted-foreground">
            {role === 'admin' ? 'Admin console' : 'Company console'}
          </div>
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

