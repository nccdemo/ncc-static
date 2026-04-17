import { useCallback, useEffect, useState } from "react";

import { connectStripe, getStripeStatus } from "../api/driverStripe.js";

const card = {
  marginBottom: 16,
  padding: "14px 16px",
  borderRadius: 12,
  background: "#fff",
  border: "1px solid #e2e8f0",
  boxShadow: "0 1px 3px rgba(15, 23, 42, 0.06)",
};

const btnPrimary = {
  display: "block",
  width: "100%",
  padding: "12px 16px",
  borderRadius: 10,
  border: "none",
  background: "#0f172a",
  color: "#fff",
  fontWeight: 600,
  fontSize: "0.9rem",
  cursor: "pointer",
};

const btnGhost = {
  marginTop: 10,
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#475569",
  fontSize: "0.8rem",
  cursor: "pointer",
};

/** Stripe Connect: create ``acct_…``, save on driver, open Stripe onboarding (NCC portal). */
export default function DriverStripeConnect() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState({
    connected: false,
    charges_enabled: false,
    payouts_enabled: false,
  });

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const data = await getStripeStatus();
      setStatus({
        connected: Boolean(data?.connected),
        charges_enabled: Boolean(data?.charges_enabled),
        payouts_enabled: Boolean(data?.payouts_enabled),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load Stripe status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onConnect = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const data = await connectStripe({ appOrigin: window.location.origin });
      const url = data?.url;
      if (typeof url === "string" && url.startsWith("http")) {
        window.location.assign(url);
        return;
      }
      setError("Stripe response missing onboarding URL.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Stripe connect failed.");
    } finally {
      setBusy(false);
    }
  }, []);

  if (loading) {
    return (
      <section style={card}>
        <p style={{ margin: 0, color: "#64748b", fontSize: "0.9rem" }}>Checking Stripe…</p>
      </section>
    );
  }

  const { connected, charges_enabled: chargesReady } = status;

  return (
    <section style={card}>
      <h2 style={{ margin: "0 0 8px", fontSize: "1rem", color: "#0f172a" }}>Stripe Connect</h2>
      <p style={{ margin: "0 0 12px", color: "#64748b", fontSize: "0.85rem" }}>
        Connect your Stripe Express account to receive card payouts from marketplace tours and rides.
      </p>
      {error ? (
        <p style={{ color: "#b91c1c", fontSize: "0.85rem", marginBottom: 12 }} role="alert">
          {error}
        </p>
      ) : null}
      {!connected ? (
        <>
          <p style={{ margin: "0 0 10px", fontSize: "0.9rem", color: "#334155" }}>
            You need a connected account before customers can pay you by card.
          </p>
          <button type="button" style={btnPrimary} disabled={busy} onClick={() => void onConnect()}>
            {busy ? "Opening Stripe…" : "Connect Stripe"}
          </button>
        </>
      ) : !chargesReady ? (
        <>
          <p
            style={{
              margin: "0 0 10px",
              padding: "10px 12px",
              borderRadius: 8,
              background: "#fffbeb",
              color: "#92400e",
              fontSize: "0.85rem",
            }}
          >
            Finish Stripe onboarding to enable charges.
          </p>
          <button type="button" style={btnPrimary} disabled={busy} onClick={() => void onConnect()}>
            {busy ? "Opening Stripe…" : "Continue Stripe setup"}
          </button>
        </>
      ) : (
        <p
          style={{
            margin: 0,
            padding: "10px 12px",
            borderRadius: 8,
            background: "#ecfdf5",
            color: "#065f46",
            fontSize: "0.9rem",
            fontWeight: 600,
          }}
        >
          Ready to receive card payments
        </p>
      )}
      <button type="button" style={btnGhost} onClick={() => void load()}>
        Refresh status
      </button>
    </section>
  );
}
