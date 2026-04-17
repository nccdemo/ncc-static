import { Link, Outlet, useNavigate } from "react-router-dom";

const NAV = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/trips", label: "Trips" },
  { to: "/drivers", label: "Drivers" },
  { to: "/vehicles", label: "Vehicles" },
  { to: "/tours", label: "Tours" },
  { to: "/tour-instances", label: "Tour instances" },
  { to: "/payments", label: "Payments" },
  { to: "/earnings", label: "Earnings" },
  { to: "/custom-rides", label: "Custom rides" },
];

export default function AdminShell() {
  const navigate = useNavigate();

  const onLogout = () => {
    localStorage.removeItem("token");
    navigate("/login", { replace: true });
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "10px 16px",
          alignItems: "center",
          padding: "10px 16px",
          borderBottom: "1px solid #e5e7eb",
          background: "#fafafa",
        }}
      >
        <strong style={{ marginRight: 8 }}>NCC Admin</strong>
        {NAV.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            style={{ fontSize: "0.875rem", color: "#2563eb" }}
          >
            {item.label}
          </Link>
        ))}
        <button
          type="button"
          onClick={onLogout}
          style={{
            marginLeft: "auto",
            padding: "6px 12px",
            fontSize: "0.875rem",
            cursor: "pointer",
            borderRadius: "6px",
            border: "1px solid #d1d5db",
            background: "#fff",
          }}
        >
          Logout
        </button>
      </header>
      <Outlet />
    </div>
  );
}
