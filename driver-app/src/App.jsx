import { Navigate, Route, Routes, useParams } from 'react-router-dom'

import { validateDriverSessionApi } from './api/client.js'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import DriverLayout from './layouts/DriverLayout.jsx'
import MobileLogin from './pages/MobileLogin.jsx'
import DriverWorkPage from './pages/DriverWorkPage.jsx'
import DriverStripeRefreshPage from './pages/DriverStripeRefreshPage.jsx'
import DriverStripeSuccessPage from './pages/DriverStripeSuccessPage.jsx'
import HistoryPage from './pages/HistoryPage.jsx'
import TodayPage from './pages/TodayPage.jsx'
import TripDetailPage from './pages/TripDetailPage.jsx'
import DriverWalletPage from './pages/DriverWalletPage.jsx'
import DriverEarningsPage from './pages/DriverEarningsPage.jsx'
import DriverSchedulePage from './pages/DriverSchedulePage.jsx'
import DriverPaymentsPage from './pages/DriverPaymentsPage.jsx'
import TodayTripsPage from './pages/TodayTripsPage.jsx'

import './App.css'

function LegacyTripRedirect() {
  const { id } = useParams()
  return <Navigate to={`/driver/trips/${id}`} replace />
}

export default function App() {
  return (
    <>
      {/* Verifica Tailwind: sfondo rosso, testo bianco (solo in dev) */}
      {import.meta.env.DEV ? (
        <div
          className="pointer-events-none fixed bottom-2 right-2 z-[10000] rounded px-3 py-2 text-sm font-medium text-white shadow-lg bg-red-600"
          aria-hidden
        >
          Tailwind OK
        </div>
      ) : null}
    <Routes>
      <Route path="/login" element={<MobileLogin />} />
      <Route
        element={
          <ProtectedRoute allowedRoles={['driver']} sessionCheck={validateDriverSessionApi} />
        }
      >
        <Route path="/driver" element={<DriverLayout loginPath="/login" />}>
          <Route index element={<Navigate to="today" replace />} />
          <Route path="today" element={<DriverWorkPage />} />
          <Route path="stripe/success" element={<DriverStripeSuccessPage />} />
          <Route path="stripe/refresh" element={<DriverStripeRefreshPage />} />
          <Route path="tours-today" element={<TodayPage />} />
          <Route path="today-trips" element={<TodayTripsPage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="wallet" element={<DriverWalletPage />} />
          <Route path="earnings" element={<DriverEarningsPage />} />
          <Route path="schedule" element={<DriverSchedulePage />} />
          <Route path="payments" element={<DriverPaymentsPage />} />
          <Route path="trips/:id" element={<TripDetailPage />} />
        </Route>

        <Route path="/today" element={<Navigate to="/driver/today" replace />} />
        <Route path="/tours-today" element={<Navigate to="/driver/tours-today" replace />} />
        <Route path="/today-trips" element={<Navigate to="/driver/today-trips" replace />} />
        <Route path="/history" element={<Navigate to="/driver/history" replace />} />
        <Route path="/earnings" element={<Navigate to="/driver/earnings" replace />} />
        <Route path="/trips/:id" element={<LegacyTripRedirect />} />
      </Route>
      <Route path="/" element={<Navigate to="/driver/today" replace />} />
      <Route path="*" element={<Navigate to="/driver/today" replace />} />
    </Routes>
    </>
  )
}
