import DriverRequestsSection from '../components/DriverRequestsSection'
import DriverSection from '../components/DriverSection'
import PageHeader from '../components/PageHeader'

export default function DriversPage() {
  return (
    <div className="admin-page-main">
      <PageHeader
        title="Drivers"
        description="Manage drivers and review self-registration requests."
      />
      <div className="admin-dashboard" style={{ maxWidth: 'none', margin: 0, padding: 0, minHeight: 'auto' }}>
        <div className="admin-grid" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <DriverRequestsSection />
          <DriverSection />
        </div>
      </div>
    </div>
  )
}
