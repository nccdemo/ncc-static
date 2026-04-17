import { Navigate, Route, Routes } from 'react-router-dom'
import { getDriverMe } from './api/client.js'
import DashboardLayout from './components/DashboardLayout.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import BookingsList from './pages/BookingsList.jsx'
import Dashboard from './pages/Dashboard.jsx'
import InstancesList from './pages/InstancesList.jsx'
import Login from './pages/Login.jsx'
import TourCreate from './pages/TourCreate.jsx'
import ToursList from './pages/ToursList.jsx'
import EarningsPage from './pages/EarningsPage.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route
        element={<ProtectedRoute allowedRoles={['driver']} sessionCheck={getDriverMe} />}
      >
        <Route element={<DashboardLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/trips" element={<BookingsList />} />
          <Route path="/tours" element={<ToursList />} />
          <Route path="/tours/create" element={<TourCreate />} />
          <Route path="/create-tour" element={<TourCreate />} />
          <Route path="/instances" element={<InstancesList />} />
          <Route path="/bookings" element={<BookingsList />} />
          <Route path="/earnings" element={<EarningsPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Route>
    </Routes>
  )
}
