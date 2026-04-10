import TripAssignment from '../components/TripAssignment'
import PageHeader from '../components/PageHeader'

export default function TripsPage() {
  return (
    <div className="admin-page-main">
      <PageHeader title="Trips" description="Assign drivers, vehicles, and tour instances to trips." />
      <TripAssignment />
    </div>
  )
}
