import { api } from "./api";

export async function getBookings() {
  return api("/driver/bookings");
}

export async function cancelBooking(id) {
  // refund first
  await api(`/bookings/${id}/refund`, {
    method: "POST",
  });

  // then delete booking
  await api(`/bookings/${id}`, {
    method: "DELETE",
  });
}

