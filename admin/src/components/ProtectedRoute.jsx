import { Navigate, Outlet } from "react-router-dom";

/** Nested routes: renders ``<Outlet />`` when ``token`` is present. */
export default function ProtectedRoute() {
  const token = localStorage.getItem("token");

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
