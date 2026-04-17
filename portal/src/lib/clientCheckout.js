import { getStoredReferralCode } from "../utils/referralStorage.js";

/** Base URL of the tourist client app (checkout / tours). */
export function clientToursBaseUrl() {
  return String(import.meta.env.VITE_CLIENT_TOURS_URL || "http://localhost:5173").replace(
    /\/$/,
    "",
  );
}

export function checkoutUrlForInstance(tourInstanceId) {
  const base = clientToursBaseUrl();
  const id = Number(tourInstanceId);
  if (!Number.isFinite(id) || id < 1) return `${base}/checkout`;
  const q = new URLSearchParams({ tour_instance_id: String(id) });
  const ref = typeof window !== "undefined" ? getStoredReferralCode() : undefined;
  if (ref) q.set("ref", ref);
  return `${base}/checkout?${q.toString()}`;
}
