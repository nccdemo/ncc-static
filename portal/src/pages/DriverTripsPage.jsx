import AvailableTrips from './AvailableTrips.jsx'
import AvailableTripsPage from './AvailableTripsPage.jsx'

const wrap = {
  maxWidth: 1200,
  margin: '0 auto',
  padding: '0 20px',
}

/**
 * Driver trip hub: marketplace (unassigned) + trips offered to this driver.
 */
export default function DriverTripsPage() {
  return (
    <div style={{ paddingBottom: 48 }}>
      <AvailableTrips />
      <div style={{ ...wrap, marginTop: 24 }}>
        <h2 style={{ margin: '0 0 8px', fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>
          Offers for you
        </h2>
        <p style={{ margin: '0 0 12px', color: '#64748b', fontSize: '0.9rem' }}>
          Trips you can accept from the pool assigned to your account.
        </p>
      </div>
      <div style={wrap}>
        <AvailableTripsPage />
      </div>
    </div>
  )
}
