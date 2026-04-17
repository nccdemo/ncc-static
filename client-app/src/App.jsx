import { useEffect } from 'react'
import { Link, Route, Routes, useLocation } from 'react-router-dom'
import BookingSuccess from './pages/BookingSuccess'
import BnbPublicLandingPage from './pages/BnbPublicLandingPage'
import PaymentSuccessPage from './pages/PaymentSuccessPage'
import BnbQr from './pages/BnbQr'
import Checkout from './pages/Checkout'
import ExplorePage from './pages/ExplorePage'
import Home from './pages/Home'
import MapPage from './pages/MapPage'
import TourDetailPage from './pages/TourDetailPage'
import Tours from './pages/Tours'
import TrackDriverPage from './pages/TrackDriverPage'
import { persistReferralFromHost, persistReferralFromUrlSearch } from './utils/referralStorage'

export default function App() {
  const { pathname, search } = useLocation()

  useEffect(() => {
    persistReferralFromHost()
    persistReferralFromUrlSearch(search)
  }, [search])

  const hideNav =
    pathname === '/' ||
    pathname === '/explore' ||
    pathname.startsWith('/map') ||
    pathname.startsWith('/track') ||
    /^\/bnb\/[^/]+$/.test(pathname)

  const exploreLayout = pathname === '/' || pathname === '/explore'

  return (
    <>
      {!hideNav ? (
        <header className="site-header">
          <Link to="/explore" className="site-logo">
            NCC Tour
          </Link>
          <nav className="site-nav">
            <Link to="/explore">Home</Link>
            <Link to="/tours">Tour</Link>
            <Link to="/map">Mappa</Link>
          </nav>
        </header>
      ) : null}
      <main className={exploreLayout ? 'layout-main layout-main--flush' : 'layout-main'}>
        <Routes>
          <Route path="/" element={<ExplorePage />} />
          <Route path="/explore" element={<ExplorePage />} />
          <Route path="/landing" element={<Home />} />
          <Route path="/bnb/qr/:code" element={<BnbQr />} />
          <Route path="/bnb/:slug" element={<BnbPublicLandingPage />} />
          <Route path="/tour/:id" element={<TourDetailPage />} />
          <Route path="/tours" element={<Tours />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/success" element={<PaymentSuccessPage />} />
          <Route path="/booking/success" element={<BookingSuccess />} />
          <Route path="/track/:token" element={<TrackDriverPage />} />
          <Route path="/map" element={<MapPage />} />
        </Routes>
      </main>
    </>
  )
}
