import { apiUrl } from "./apiUrl.js";
import { getStoredReferralCode } from "../utils/referralStorage.js";

/**
 * POST ``/api/bookings/tour-instance`` with ``referral_code`` merged from stored ``?ref=``.
 *
 * @param {{
 *   tour_instance_id: number;
 *   seats: number;
 *   customer_name?: string | null;
 *   email?: string | null;
 *   phone?: string | null;
 *   tour_id?: number | null;
 *   referral_code?: string | null;
 * }} body
 */
export async function postTourInstanceBooking(body) {
  const stored = getStoredReferralCode();
  const explicit = body.referral_code != null ? String(body.referral_code).trim().toUpperCase() : "";
  const merged = explicit || stored || "";
  const referral_code = merged ? merged : null;
  const payload = {
    tour_instance_id: Number(body.tour_instance_id),
    seats: Number(body.seats),
    customer_name: (body.customer_name ?? "Guest").toString().trim() || "Guest",
    email: (body.email ?? "noreply@booking.local").toString().trim() || "noreply@booking.local",
    phone: (body.phone ?? "N/A").toString().trim() || "N/A",
    tour_id: body.tour_id != null ? Number(body.tour_id) : null,
    referral_code: referral_code || null,
  };
  const res = await fetch(apiUrl("/api/bookings/tour-instance"), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
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
      `Booking failed (${res.status})`;
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return data;
}
