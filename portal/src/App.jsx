import { useEffect } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  Navigate,
  useLocation,
} from "react-router-dom";
import { persistReferralFromUrlSearch } from "./utils/referralStorage.js";
import LoginPage from "./pages/Login";
import RequireRole from "./components/RequireRole";
import AdminLayout from "./components/AdminLayout";
import PortalLayout from "./components/PortalLayout";
import BnbLayout from "./components/BnbLayout";
import AdminDashboardPage from "./pages/AdminDashboardPage";
import AdminTripsPage from "./pages/admin/AdminTripsPage";
import AdminUsersPage from "./pages/admin/AdminUsersPage";
import AdminPaymentsPage from "./pages/admin/AdminPaymentsPage";
import AdminTrackingPage from "./pages/admin/AdminTrackingPage";
import DriverTripsPage from "./pages/DriverTripsPage";
import DriverHistoryPage from "./pages/DriverHistoryPage";
import BnbDashboardHubPage from "./pages/BnbDashboardHubPage";
import BnbDashboardMainPage from "./pages/BnbDashboardMainPage";
import BnbEarningsPage from "./pages/BnbEarningsPage";
import BnbReferralsPage from "./pages/BnbReferralsPage";
import BnbAffiliateToursPage from "./pages/BnbAffiliateToursPage";
import BnbRegisterPage from "./pages/BnbRegisterPage";
import CreateTourPage from "./pages/CreateTourPage";
import DriverToursPage from "./pages/DriverToursPage";
import ExplorePage from "./pages/ExplorePage";
import BookingHomePage from "./pages/BookingHomePage.jsx";
import TourDetailPage from "./pages/TourDetailPage";
import TourInstancesPage from "./pages/TourInstancesPage";
import PublicTourDetailPage from "./pages/PublicTourDetailPage";
import ToursPage from "./pages/ToursPage";
import PaymentSuccessPage from "./pages/PaymentSuccessPage";
import TransferPage from "./pages/TransferPage";
import TrackPage from "./pages/TrackPage.jsx";
import DriverStripeSuccessPage from "./pages/DriverStripeSuccessPage";
import DriverStripeRefreshPage from "./pages/DriverStripeRefreshPage";
import DriverStripeConnect from "./components/DriverStripeConnect.jsx";

/** Persist ``?ref=`` on any route (e.g. landing with ``?ref=``). */
function ReferralCapture() {
  const { search } = useLocation();
  useEffect(() => {
    persistReferralFromUrlSearch(search);
  }, [search]);
  return null;
}

function DriverDashboardPage() {
  return (
    <main style={{ padding: "24px 20px 48px", maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ margin: "0 0 16px" }}>Dashboard</h1>
      <p style={{ margin: "0 0 20px", color: "#64748b", fontSize: "0.95rem" }}>
        Pick up open jobs from the marketplace. Connect Stripe to receive card payments on tours and rides.
      </p>
      <DriverStripeConnect />
      <Link
        to="/driver/trips"
        style={{
          display: "inline-block",
          marginTop: 8,
          padding: "10px 16px",
          background: "#0f172a",
          color: "#fff",
          borderRadius: 8,
          textDecoration: "none",
          fontSize: "0.9rem",
          fontWeight: 600,
        }}
      >
        Trips
      </Link>
    </main>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ReferralCapture />
      <Routes>
        {/* Public: booking homepage (conversions) */}
        <Route path="/" element={<BookingHomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/driver/login" element={<Navigate to="/login" replace />} />
        <Route path="/bnb/login" element={<Navigate to="/login" replace />} />
        <Route path="/bnb/register" element={<BnbRegisterPage />} />
        <Route path="/dashboard/bnb" element={<Navigate to="/bnb-dashboard" replace />} />
        <Route
          path="/bnb-dashboard"
          element={
            <RequireRole role="bnb">
              <BnbLayout />
            </RequireRole>
          }
        >
          <Route index element={<BnbDashboardHubPage />} />
        </Route>
        <Route path="/transfer" element={<TransferPage />} />
        <Route path="/track/:token" element={<TrackPage />} />
        <Route path="/tours" element={<ToursPage />} />
        <Route path="/success" element={<PaymentSuccessPage />} />
        <Route path="/tours/:tourId" element={<PublicTourDetailPage />} />
        <Route path="/trips" element={<Navigate to="/driver/trips" replace />} />
        <Route path="/explore" element={<ExplorePage />} />
        <Route path="/home" element={<Navigate to="/" replace />} />

        {/* Protected: RequireRole guards JWT + role */}
        <Route
          path="/admin"
          element={
            <RequireRole role="admin">
              <AdminLayout />
            </RequireRole>
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboardPage />} />
          <Route path="trips" element={<AdminTripsPage />} />
          <Route path="users" element={<AdminUsersPage />} />
          <Route path="payments" element={<AdminPaymentsPage />} />
          <Route path="tracking" element={<AdminTrackingPage />} />
        </Route>

        <Route
          path="/driver"
          element={
            <RequireRole role="driver">
              <PortalLayout />
            </RequireRole>
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<DriverDashboardPage />} />
          <Route path="stripe/success" element={<DriverStripeSuccessPage />} />
          <Route path="stripe/refresh" element={<DriverStripeRefreshPage />} />
          <Route path="trips" element={<DriverTripsPage />} />
          <Route path="tours" element={<DriverToursPage />} />
          <Route path="tours/new" element={<CreateTourPage />} />
          <Route path="tours/:id/instances" element={<TourInstancesPage />} />
          <Route path="tours/:id" element={<TourDetailPage />} />
          <Route path="history" element={<DriverHistoryPage />} />
          <Route path="available-trips" element={<Navigate to="/driver/trips" replace />} />
        </Route>

        <Route
          path="/bnb"
          element={
            <RequireRole role="bnb">
              <BnbLayout />
            </RequireRole>
          }
        >
          <Route index element={<Navigate to="/bnb-dashboard" replace />} />
          <Route path="dashboard" element={<Navigate to="/bnb-dashboard" replace />} />
          <Route path="profile" element={<BnbDashboardMainPage />} />
          <Route path="earnings" element={<BnbEarningsPage />} />
          <Route path="referrals" element={<BnbReferralsPage />} />
          <Route path="affiliate-tours" element={<BnbAffiliateToursPage />} />
          <Route path="tours" element={<Navigate to="/bnb/referrals" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
