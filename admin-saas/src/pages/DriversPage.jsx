import DriverSection from '@admin/components/DriverSection.jsx'
import '@admin/components/AdminDashboard.css'

export function DriversPage() {
  return (
    <div className="space-y-6">
      <div>
        <div className="text-2xl font-semibold tracking-tight">Drivers</div>
        <div className="text-sm text-muted-foreground">
          CRUD da API: <span className="font-mono">GET/POST/DELETE /api/drivers/</span>
        </div>
      </div>
      <DriverSection />
    </div>
  )
}
