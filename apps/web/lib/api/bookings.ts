import type { Booking } from "@/lib/types";
import { getApi } from "../api";

const api = getApi();
const API = "/v1";

export const bookingsApi = {
	list: () => api.get<{ bookings: Booking[] }>(`${API}/bookings`),
	get: (bookingId: string) =>
		api.get<{ booking: Booking }>(`${API}/bookings/${bookingId}`),
	create: (slotId: string) =>
		api.post<{ booking: Booking }>(`${API}/bookings`, { slot_id: slotId }),
	reschedule: (bookingId: string, newSlotId: string) =>
		api.post<{ booking: Booking }>(`${API}/bookings/${bookingId}/reschedule`, {
			new_slot_id: newSlotId,
		}),
	cancel: (
		bookingId: string,
		data: { cancel_reason: string; cancel_note?: string },
	) => api.delete(`${API}/bookings/${bookingId}`, { data }),
	updateStatus: (
		bookingId: string,
		data: { status: "completed" | "no_show" },
	) =>
		api.patch<{ booking: Booking }>(
			`${API}/bookings/${bookingId}/status`,
			data,
		),
};
