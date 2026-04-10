import PageHeader from '../components/PageHeader'
import VehicleSection from '../components/VehicleSection'

export default function VehiclesPage() {
  return (
    <div className="admin-page-main">
      <PageHeader title="Vehicles" description="Fleet vehicles available for trips and tours." />
      <VehicleSection />
    </div>
  )
}
