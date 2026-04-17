import { Link } from "react-router-dom";

export default function DriverStripeRefreshPage() {
  return (
    <main style={{ padding: "24px 20px 48px", maxWidth: 560, margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.25rem", marginBottom: 12, color: "#0f172a" }}>Stripe</h1>
      <p style={{ margin: "0 0 20px", color: "#64748b", fontSize: "0.95rem", lineHeight: 1.5 }}>
        The onboarding link expired. Open the dashboard and tap &quot;Connect Stripe&quot; or &quot;Continue
        Stripe setup&quot; again.
      </p>
      <Link
        to="/driver/dashboard"
        style={{
          display: "inline-block",
          padding: "10px 18px",
          background: "#0f172a",
          color: "#fff",
          borderRadius: 10,
          textDecoration: "none",
          fontWeight: 600,
          fontSize: "0.9rem",
        }}
      >
        Back to dashboard
      </Link>
    </main>
  );
}
