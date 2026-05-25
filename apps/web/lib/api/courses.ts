import type { Course } from "@/lib/types";
import { getApi } from "../api";

const api = getApi();
const API = "/v1";

export const coursesApi = {
	list: (term?: string) =>
		api.get<{ courses: Course[]; meta: { total: number } }>(`${API}/courses`, {
			params: term ? { term } : undefined,
		}),
	get: (courseId: string) =>
		api.get<{ course: Course }>(`${API}/courses/${courseId}`),
	create: (data: {
		code: string;
		title: string;
		term: string;
		owner_id: string;
	}) => api.post<{ course: Course }>(`${API}/courses`, data),
	createEnrollment: (
		courseId: string,
		data: { user_id: string; role_in_course: string },
	) => api.post(`${API}/courses/${courseId}/enrollments`, data),
	bulkEnroll: (courseId: string, file: File) => {
		const formData = new FormData();
		formData.append("file", file);
		return api.post(`${API}/courses/${courseId}/enrollments/bulk`, formData, {
			headers: { "Content-Type": "multipart/form-data" },
		});
	},
};
