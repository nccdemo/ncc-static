import { Navigate, Route, Routes } from 'react-router-dom'
import { getDriverMe } from './api/client.js'
import ProtectedLayout from './components/ProtectedLayout.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import BookingsList from './pages/BookingsList.jsx'
import Dashboard from './pages/Dashboard.jsx'
import InstancesList from './pages/InstancesList.jsx'
import TourCreate from './pages/TourCreate.jsx'
import ToursList from './pages/ToursList.jsx'

export default function App() {
  return (
    <Routes>
      <Route
        element={<ProtectedRoute allowedRoles={['driver']} sessionCheck={getDriverMe} />}
      >
        <Route element={<ProtectedLayout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/tours" element={<ToursList />} />
          <Route path="/tours/create" element={<TourCreate />} />
          <Route path="/instances" element={<InstancesList />} />
          <Route path="/bookings" element={<BookingsList />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Route>
    </Routes>
  )
}
