import CustomRideSection from '../components/CustomRideSection'
import PageHeader from '../components/PageHeader'

export default function CustomRidesPage() {
  return (
    <div className="admin-page-main">
      <PageHeader title="Custom Rides" description="Configure custom ride offerings and pricing." />
      <CustomRideSection />
    </div>
  )
}
