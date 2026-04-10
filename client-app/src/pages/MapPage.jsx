import { Link } from 'react-router-dom'
import ClientMap from '../components/ClientMap'

export default function MapPage() {
  return (
    <div className="map-page">
      <nav className="map-page-nav">
        <Link to="/tours">← Tour</Link>
        <Link to="/">Home</Link>
      </nav>
      <ClientMap />
    </div>
  )
}
