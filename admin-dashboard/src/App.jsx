import { Navigate, Route, Routes } from 'react-router-dom'

import { getAdminPing } from './api/client.js'
import ProtectedLayout from './components/ProtectedLayout.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import AdminBnbList from './pages/AdminBnbList.jsx'
import BnbPage from './pages/BnbPage.jsx'
import BookingsPage from './pages/BookingsPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import DriversPage from './pages/DriversPage.jsx'
import LoginPage from './pages/LoginPage.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute allowedRoles={['admin']} sessionCheck={getAdminPing} />}>
        <Route element={<ProtectedLayout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/bnb" element={<BnbPage />} />
          <Route path="/admin/bnb" element={<AdminBnbList />} />
          <Route path="/drivers" element={<DriversPage />} />
          <Route path="/bookings" element={<BookingsPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Route>
    </Routes>
  )
}
