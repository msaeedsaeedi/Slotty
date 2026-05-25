import type { Evaluation } from "@/lib/types";
import { getApi } from "../api";

const api = getApi();
const API = "/v1";

export const evaluationsApi = {
	create: (data: {
		booking_id: string;
		rubric_scores: Record<string, unknown>;
		total_score: number;
		private_note?: string;
	}) => api.post<{ evaluation: Evaluation }>(`${API}/evaluations`, data),
	get: (evaluationId: string) =>
		api.get<{ evaluation: Evaluation }>(`${API}/evaluations/${evaluationId}`),
	update: (
		evaluationId: string,
		data: {
			total_score?: number;
			rubric_scores?: Record<string, unknown>;
			private_note?: string;
		},
	) =>
		api.patch<{ evaluation: Evaluation }>(
			`${API}/evaluations/${evaluationId}`,
			data,
		),
	submitBatch: (assignmentId: string) =>
		api.post<{ submitted: number; submittedAt: string }>(
			`${API}/assignments/${assignmentId}/evaluations/submit`,
		),
	byCourse: (courseId: string, params?: { assignmentId?: string }) =>
		api.get<{ evaluations: Evaluation[] }>(
			`${API}/courses/${courseId}/evaluations`,
			{ params },
		),
};
