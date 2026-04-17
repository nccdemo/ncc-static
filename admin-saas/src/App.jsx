import { useEffect } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'

import { persistReferralFromUrlSearch } from './lib/referralStorage.js'

import ProtectedRoute from './components/ProtectedRoute.jsx'
import { AppLayout } from './layouts/AppLayout.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { DashboardPage } from './pages/DashboardPage.jsx'
import { TripsPage } from './pages/TripsPage.jsx'
import { BookingsPage } from './pages/BookingsPage.jsx'
import { BookingDetailPage } from './pages/BookingDetailPage.jsx'
import { BookingEditPage } from './pages/BookingEditPage.jsx'
import { DriversPage } from './pages/DriversPage.jsx'
import { VehiclesPage } from './pages/VehiclesPage.jsx'
import { CustomRidesPage } from './pages/CustomRidesPage.jsx'
import { ToursPage } from './pages/ToursPage.jsx'
import { AdminInstancesPage } from './pages/AdminInstancesPage.jsx'
import { AdminPaymentsPage } from './pages/AdminPaymentsPage.jsx'
import { AdminEarningsDashboard } from './pages/AdminEarningsDashboard.jsx'
import { AdminBnbPage } from './pages/AdminBnbPage.jsx'
import { AdminBnbDetail } from './pages/AdminBnbDetail.jsx'
import { AdminControlPage } from './pages/AdminControlPage.jsx'
import { PublicToursPage } from './pages/PublicToursPage.jsx'
import { TourDetailPage } from './pages/TourDetailPage.jsx'
import BookingPage from './pages/BookingPage.jsx'
import { QuotePage } from './pages/QuotePage.jsx'
import { PayPage } from './pages/PayPage.jsx'
import { PaymentCancelPage, PaymentSuccessPage } from './pages/PaymentFlowPages.jsx'
import Login from './pages/Login.jsx'

function ReferralFromUrl() {
  const { search } = useLocation()
  useEffect(() => {
    persistReferralFromUrlSearch(search)
  }, [search])
  return null
}

function App() {
  return (
    <AuthProvider>
      <ReferralFromUrl />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/public/tours" element={<PublicToursPage />} />
        <Route path="/public/tours/:id" element={<TourDetailPage />} />
        <Route path="/booking" element={<BookingPage />} />
        <Route path="/quote/:id" element={<QuotePage />} />
        <Route path="/pay/:id" element={<PayPage />} />
        <Route path="/payment-success" element={<PaymentSuccessPage />} />
        <Route path="/payment-cancel" element={<PaymentCancelPage />} />
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<DashboardPage />} />
          <Route path="/admin" element={<DashboardPage />} />
          <Route path="/trips" element={<TripsPage />} />
          <Route path="/bookings" element={<BookingsPage />} />
          <Route path="/bookings/:id" element={<BookingDetailPage />} />
          <Route path="/bookings/:id/edit" element={<BookingEditPage />} />
          <Route path="/drivers" element={<DriversPage />} />
          <Route path="/vehicles" element={<VehiclesPage />} />
          <Route path="/custom-rides" element={<CustomRidesPage />} />
          <Route path="/tours" element={<ToursPage />} />
          <Route path="/admin/instances" element={<AdminInstancesPage />} />
          <Route path="/admin/payments" element={<AdminPaymentsPage />} />
          <Route path="/admin/dashboard" element={<AdminEarningsDashboard />} />
          <Route path="/admin/bnb/:id" element={<AdminBnbDetail />} />
          <Route path="/admin/bnb" element={<AdminBnbPage />} />
          <Route path="/admin-control" element={<AdminControlPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  )
}

export default App
