import { apiUrl } from "../api/apiUrl.js";

/**
 * Public marketplace tours (no auth).
 * @returns {Promise<unknown[]>}
 */
export async function fetchPublicTours() {
  const base = apiUrl("/api/tours");
  const withSlash = base.endsWith("/") ? base : `${base}/`;
  let res = await fetch(withSlash, { headers: { Accept: "application/json" } });
  if (!res.ok && res.status === 404) {
    res = await fetch(base, { headers: { Accept: "application/json" } });
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * @param {{ title: string; price: number }} tour
 * @param {string} [cancelPath] pathname after origin when user cancels checkout (default `/`).
 * @returns {Promise<string | null>} Stripe Checkout URL or null
 */
export async function createTourCheckoutSession(tour, cancelPath = "/") {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const amount = Number(tour.price);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Invalid tour price");
  }
  const path = cancelPath.startsWith("/") ? cancelPath : `/${cancelPath}`;
  const url = apiUrl("/api/payments/create-checkout-session");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: tour.title,
      price: amount,
      success_url: `${origin}/success`,
      cancel_url: `${origin}${path}`,
    }),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const detail =
      (data && (data.detail || data.message)) ||
      text ||
      `Checkout failed (${res.status})`;
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  const checkout = (data && (data.checkout_url || data.url)) || "";
  return checkout ? String(checkout) : null;
}
