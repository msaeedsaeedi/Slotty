import type { User } from "@/lib/types";
import { getApi } from "../api";

const api = getApi();
const API = "/v1";

export const adminApi = {
	listUsers: (email?: string) =>
		api.get<{ users: User[] }>(`${API}/users`, {
			params: email ? { email } : undefined,
		}),
	createUser: (data: {
		name: string;
		email: string;
		role: string;
		roll_number?: string;
	}) => api.post<{ user: User }>(`${API}/users`, data),
};
