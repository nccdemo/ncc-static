import { Navigate, Route, Routes } from 'react-router-dom'

import { validateDriverSessionApi } from './api/client.js'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import MobileLogin from './pages/MobileLogin.jsx'
import HistoryPage from './pages/HistoryPage.jsx'
import TodayPage from './pages/TodayPage.jsx'
import TripDetailPage from './pages/TripDetailPage.jsx'

import './App.css'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<MobileLogin />} />
      <Route
        element={
          <ProtectedRoute allowedRoles={['driver']} sessionCheck={validateDriverSessionApi} />
        }
      >
        <Route path="/today" element={<TodayPage />} />
        <Route path="/trips/:id" element={<TripDetailPage />} />
        <Route path="/history" element={<HistoryPage />} />
      </Route>
      <Route path="/" element={<Navigate to="/today" replace />} />
      <Route path="*" element={<Navigate to="/today" replace />} />
    </Routes>
  )
}
