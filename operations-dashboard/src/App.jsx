import { BrowserRouter, Route, Routes } from 'react-router-dom'

import Dashboard from './pages/Dashboard'
import DashboardLayout from './pages/DashboardLayout.jsx'
import DashboardTripsPage from './pages/DashboardTripsPage.jsx'
import Landing from './pages/Landing'
import { AdminSignIn } from './pages/AdminSignIn.jsx'
import BnbPage from './pages/BnbPage.jsx'
import TourOperatorPage from './pages/TourOperatorPage.jsx'
import RegisterBnb from './pages/RegisterBnb'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/bnb" element={<BnbPage />} />
        <Route path="/register-bnb" element={<RegisterBnb />} />
        <Route path="/tour-operator" element={<TourOperatorPage />} />
        <Route path="/sign-in" element={<AdminSignIn />} />
        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="trips" element={<DashboardTripsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
