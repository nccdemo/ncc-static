import { Navigate, Route, Routes } from 'react-router-dom'
import { getBnbPartnerMe } from './api/client.js'
import ProtectedLayout from './components/ProtectedLayout.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import BnbLoginPage from './pages/BnbLoginPage.jsx'
import BnbDashboard from './pages/BnbDashboard.jsx'
import EarningsPage from './pages/EarningsPage.jsx'
import ReferralsPage from './pages/ReferralsPage.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<BnbLoginPage />} />
      <Route element={<ProtectedRoute allowedRoles={['bnb']} sessionCheck={getBnbPartnerMe} />}>
        <Route element={<ProtectedLayout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<BnbDashboard />} />
          <Route path="/referrals" element={<ReferralsPage />} />
          <Route path="/earnings" element={<EarningsPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Route>
    </Routes>
  )
}
