import type { Booking, DemoSlot } from "@/lib/types";
import { getApi } from "../api";

const api = getApi();
const API = "/v1";

export const slotsApi = {
	list: (assignmentId: string, params?: { status?: string; date?: string }) =>
		api.get<{ slots: DemoSlot[] }>(`${API}/assignments/${assignmentId}/slots`, {
			params,
		}),
	generate: (assignmentId: string) =>
		api.post<{ slots: DemoSlot[]; count: number }>(
			`${API}/assignments/${assignmentId}/slots/generate`,
		),
	update: (slotId: string, data: { status?: string; venue?: string }) =>
		api.patch<{ slot: DemoSlot }>(`${API}/slots/${slotId}`, data),
	getBookings: (slotId: string) =>
		api.get<{ bookings: Booking[] }>(`${API}/slots/${slotId}/bookings`),
};
