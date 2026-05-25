import type { User } from "@/lib/types";
import { getApi } from "../api";

const api = getApi();
const API = "/v1";

export const authApi = {
	me: () => api.get<{ user: User }>(`${API}/auth/me`),
	logout: () => api.post(`${API}/auth/logout`),
};
