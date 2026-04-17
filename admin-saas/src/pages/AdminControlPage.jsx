import { useMemo, useState } from 'react'

import { useAuth } from '../context/AuthContext.jsx'
import { BookingsPage } from './BookingsPage.jsx'
import { TripsPage } from './TripsPage.jsx'
import { VehiclesPage } from './VehiclesPage.jsx'
import { DriversPage } from './DriversPage.jsx'
import { AdminBnbPage } from './AdminBnbPage.jsx'
import { AdminPaymentsPage } from './AdminPaymentsPage.jsx'

const TABS = [
  { id: 'bookings', label: 'Bookings' },
  { id: 'trips', label: 'Trips' },
  { id: 'vehicles', label: 'Vehicles' },
  { id: 'drivers', label: 'Drivers' },
  { id: 'partners', label: 'Partners' },
  { id: 'payments', label: 'Payments' },
]

export function AdminControlPage() {
  const { role } = useAuth()
  const [tab, setTab] = useState('bookings')

  const active = useMemo(() => TABS.find((t) => t.id === tab) ?? TABS[0], [tab])

  if (role !== 'admin') {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Forbidden (admin only).
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="text-2xl font-semibold tracking-tight">Admin Control</div>
        <div className="text-sm text-muted-foreground">Full management panel (tabbed).</div>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const isActive = t.id === active.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={[
                'inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold',
                isActive
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      <div>
        {active.id === 'bookings' ? <BookingsPage /> : null}
        {active.id === 'trips' ? <TripsPage /> : null}
        {active.id === 'vehicles' ? <VehiclesPage /> : null}
        {active.id === 'drivers' ? <DriversPage /> : null}
        {active.id === 'partners' ? <AdminBnbPage /> : null}
        {active.id === 'payments' ? <AdminPaymentsPage /> : null}
      </div>
    </div>
  )
}

