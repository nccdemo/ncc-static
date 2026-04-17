import { Routes, Route, Navigate } from "react-router-dom";

import ProtectedRoute from "./components/ProtectedRoute.jsx";
import AdminShell from "./layouts/AdminShell.jsx";
import CustomRidesPage from "./pages/CustomRidesPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import DriversPage from "./pages/DriversPage.jsx";
import EarningsPage from "./pages/EarningsPage.jsx";
import Login from "./pages/Login.jsx";
import PaymentsPage from "./pages/PaymentsPage.jsx";
import TourInstancesPage from "./pages/TourInstancesPage.jsx";
import ToursListPage from "./pages/ToursListPage.jsx";
import TripsPage from "./pages/TripsPage.jsx";
import VehiclesPage from "./pages/VehiclesPage.jsx";

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AdminShell />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/trips" element={<TripsPage />} />
          <Route path="/drivers" element={<DriversPage />} />
          <Route path="/vehicles" element={<VehiclesPage />} />
          <Route path="/tours" element={<ToursListPage />} />
          <Route path="/tour-instances" element={<TourInstancesPage />} />
          <Route path="/payments" element={<PaymentsPage />} />
          <Route path="/earnings" element={<EarningsPage />} />
          <Route path="/custom-rides" element={<CustomRidesPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default App;
