import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Link, Navigate, useLocation } from "react-router-dom";
import { persistReferralFromUrlSearch } from "./utils/referralStorage.js";
import Login from "./pages/Login";
import ProtectedRoute from "./components/ProtectedRoute";
import ProtectedBnbRoute from "./components/ProtectedBnbRoute";
import PortalLayout from "./components/PortalLayout";
import BnbLayout from "./components/BnbLayout";
import DriverLoginPage from "./pages/DriverLoginPage";
import AvailableTripsPage from "./pages/AvailableTripsPage";
import AvailableTrips from "./pages/AvailableTrips";
import BnbLoginPage from "./pages/BnbLoginPage";
import BnbDashboardPage from "./pages/BnbDashboardPage";
import BnbDashboardMainPage from "./pages/BnbDashboardMainPage";
import BnbAffiliateToursPage from "./pages/BnbAffiliateToursPage";
import BnbRegisterPage from "./pages/BnbRegisterPage";
import ToursBookingRedirect from "./pages/ToursBookingRedirect";

/** Stripe cancel URL uses `/tours`; portal lists trips at `/trips` — preserve query (e.g. canceled=true). */
function ToursCompatRedirect() {
  const { search } = useLocation();
  return <Navigate to={`/trips${search}`} replace />;
}

/** Persist ``?ref=`` on any route (e.g. ``/tours?ref=`` then redirect to ``/trips?ref=``). */
function ReferralCapture() {
  const { search } = useLocation();
  useEffect(() => {
    persistReferralFromUrlSearch(search);
  }, [search]);
  return null;
}

function Dashboard() {
  return (
    <main style={{ padding: "24px 20px 48px", maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ margin: "0 0 16px" }}>Dashboard</h1>
      <p style={{ margin: "0 0 12px", color: "#64748b", fontSize: "0.95rem" }}>
        Pick up open jobs from the marketplace.
      </p>
      <Link
        to="/driver/available-trips"
        style={{
          display: "inline-block",
          padding: "10px 16px",
          background: "#0f172a",
          color: "#fff",
          borderRadius: 8,
          textDecoration: "none",
          fontSize: "0.9rem",
          fontWeight: 600,
        }}
      >
        Available trips
      </Link>
    </main>
  );
}

function App() {
  console.log("Router loaded");

  return (
    <BrowserRouter>
      <ReferralCapture />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/driver/login" element={<DriverLoginPage />} />
        <Route path="/bnb/login" element={<BnbLoginPage />} />
        <Route path="/bnb/register" element={<BnbRegisterPage />} />
        <Route path="/dashboard/bnb" element={<Navigate to="/bnb/dashboard" replace />} />
        <Route path="/bnb-dashboard" element={<Navigate to="/bnb/dashboard" replace />} />
        <Route path="/tours/:tourId" element={<ToursBookingRedirect />} />
        <Route path="/tours" element={<ToursCompatRedirect />} />

        <Route
          path="/bnb"
          element={
            <ProtectedBnbRoute>
              <BnbLayout />
            </ProtectedBnbRoute>
          }
        >
          <Route index element={<BnbDashboardPage />} />
          <Route path="dashboard" element={<BnbDashboardMainPage />} />
          <Route path="tours" element={<BnbAffiliateToursPage />} />
        </Route>

        <Route
          element={
            <ProtectedRoute>
              <PortalLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<Dashboard />} />
          <Route path="/trips" element={<AvailableTrips />} />
          <Route path="/driver/available-trips" element={<AvailableTripsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
