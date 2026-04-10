import { readDriverSession } from '../lib/api'
import MyPaymentsView from '../components/MyPaymentsView'

export default function DriverPaymentsPage() {
  const id = readDriverSession()?.driver?.id
  if (id == null) return null
  return (
    <div className="app-shell">
      <div className="container">
        <main className="app-main">
          <MyPaymentsView driverId={id} />
        </main>
      </div>
    </div>
  )
}
