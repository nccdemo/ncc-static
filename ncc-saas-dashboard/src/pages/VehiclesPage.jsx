import VehicleSection from '@admin/components/VehicleSection.jsx'
import '@admin/components/AdminDashboard.css'

export function VehiclesPage() {
  return (
    <div className="space-y-6">
      <div>
        <div className="text-2xl font-semibold tracking-tight">Vehicles</div>
        <div className="text-sm text-muted-foreground">
          CRUD da API: <span className="font-mono">GET/POST/DELETE /api/vehicles/</span>
        </div>
      </div>
      <VehicleSection />
    </div>
  )
}
