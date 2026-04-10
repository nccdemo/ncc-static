import { useEffect } from 'react'
import { Link, Route, Routes, useLocation } from 'react-router-dom'
import BookingSuccess from './pages/BookingSuccess'
import BnbQr from './pages/BnbQr'
import Checkout from './pages/Checkout'
import Home from './pages/Home'
import MapPage from './pages/MapPage'
import Tours from './pages/Tours'
import {
  getSubdomainReferral,
  persistReferralFromUrlSearch,
  REFERRAL_STORAGE_KEY,
} from './utils/referralStorage'

export default function App() {
  const { pathname, search } = useLocation()

  useEffect(() => {
    const subRef = getSubdomainReferral()
    if (subRef) {
      localStorage.setItem(REFERRAL_STORAGE_KEY, subRef)
    }
    persistReferralFromUrlSearch(search)
  }, [search])

  const hideNav = pathname.startsWith('/map')

  return (
    <>
      {!hideNav ? (
        <header className="site-header">
          <Link to="/" className="site-logo">
            NCC Tour
          </Link>
          <nav className="site-nav">
            <Link to="/">Home</Link>
            <Link to="/tours">Tour</Link>
            <Link to="/map">Mappa</Link>
          </nav>
        </header>
      ) : null}
      <main className="layout-main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/bnb/qr/:code" element={<BnbQr />} />
          <Route path="/tours" element={<Tours />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/booking/success" element={<BookingSuccess />} />
          <Route path="/map" element={<MapPage />} />
        </Routes>
      </main>
    </>
  )
}
