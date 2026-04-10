import { readDriverSession } from '../lib/api'
import EarningsView from '../components/EarningsView'

export default function DriverEarningsPage() {
  const id = readDriverSession()?.driver?.id
  if (id == null) return null
  return (
    <div className="app-shell">
      <div className="container">
        <main className="app-main">
          <EarningsView driverId={id} />
        </main>
      </div>
    </div>
  )
}
