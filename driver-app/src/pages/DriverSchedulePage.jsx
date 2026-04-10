import { readDriverSession } from '../lib/api'
import ScheduleView from '../components/ScheduleView'

export default function DriverSchedulePage() {
  const id = readDriverSession()?.driver?.id
  if (id == null) return null
  return (
    <div className="app-shell">
      <div className="container">
        <main className="app-main">
          <ScheduleView driverId={id} />
        </main>
      </div>
    </div>
  )
}
