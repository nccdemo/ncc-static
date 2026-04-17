import { apiUrl } from "./apiUrl.js";
import { authFetch } from "./authFetch.js";

function detailFromResponse(data) {
  const d = data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) {
    return d.map((x) => (typeof x?.msg === "string" ? x.msg : JSON.stringify(x))).join(", ");
  }
  return null;
}

/**
 * Create Connect Express account (if needed), persist ``stripe_account_id``, return Account Link URL.
 * @param {{ appOrigin?: string }} [opts]
 */
export async function connectStripe(opts = {}) {
  const appOrigin =
    typeof window !== "undefined" ? (opts.appOrigin ?? window.location.origin) : opts.appOrigin;
  const res = await authFetch(apiUrl("/api/driver/stripe/connect"), {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(
      appOrigin && String(appOrigin).trim() ? { app_origin: String(appOrigin).trim() } : {},
    ),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(detailFromResponse(data) || `Stripe connect failed (${res.status})`);
  }
  return data;
}

export async function getStripeStatus() {
  const res = await authFetch(apiUrl("/api/driver/stripe/status"), {
    headers: { Accept: "application/json" },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(detailFromResponse(data) || `Stripe status failed (${res.status})`);
  }
  return data;
}
