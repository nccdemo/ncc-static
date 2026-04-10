import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { readDispatchAdminSession } from './lib/api.js'
import Dashboard from './pages/Dashboard'
import Landing from './pages/Landing'
import { AdminSignIn } from './pages/AdminSignIn.jsx'
import BnbPage from './pages/BnbPage.jsx'
import TourOperatorPage from './pages/TourOperatorPage.jsx'
import RegisterBnb from './pages/RegisterBnb'

function ProtectedDashboard() {
  if (!readDispatchAdminSession()?.token) {
    return <Navigate to="/sign-in" replace />
  }
  return <Dashboard />
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/bnb" element={<BnbPage />} />
        <Route path="/register-bnb" element={<RegisterBnb />} />
        <Route path="/tour-operator" element={<TourOperatorPage />} />
        <Route path="/sign-in" element={<AdminSignIn />} />
        <Route path="/dashboard" element={<ProtectedDashboard />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
