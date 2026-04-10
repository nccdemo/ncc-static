import { Route, Routes } from 'react-router-dom'
import Layout from './Layout.jsx'
import Landing from './pages/Landing.jsx'
import DriverPage from './pages/DriverPage.jsx'
import BnbPage from './pages/BnbPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import RegisterDriverPage from './pages/RegisterDriverPage.jsx'
import RegisterBnbPage from './pages/RegisterBnbPage.jsx'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/driver" element={<DriverPage />} />
        <Route path="/bnb" element={<BnbPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register-driver" element={<RegisterDriverPage />} />
        <Route path="/register-bnb" element={<RegisterBnbPage />} />
      </Routes>
    </Layout>
  )
}
