import type { Assignment } from "@/lib/types";
import { getApi } from "../api";

const api = getApi();
const API = "/v1";

export const assignmentsApi = {
	create: (
		courseId: string,
		data: {
			title: string;
			demo_window_start: string;
			demo_window_end: string;
			slot_duration_min: number;
			slot_capacity: number;
			freeze_before_min?: number;
			max_cancellations?: number;
			default_venue?: string;
		},
	) =>
		api.post<{ assignment: Assignment }>(
			`${API}/assignments/${courseId}`,
			data,
		),
};
