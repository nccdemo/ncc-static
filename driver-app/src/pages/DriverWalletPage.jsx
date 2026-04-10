import { readDriverSession } from '../lib/api'
import WalletView from '../components/WalletView'

export default function DriverWalletPage() {
  const id = readDriverSession()?.driver?.id
  if (id == null) return null
  return (
    <div className="app-shell">
      <div className="container">
        <main className="app-main">
          <WalletView driverId={id} />
        </main>
      </div>
    </div>
  )
}
