import type { Notification } from "@/lib/types";
import { getApi } from "../api";

const api = getApi();
const API = "/v1";

export const notificationsApi = {
	list: (params?: { unread?: boolean; limit?: number; cursor?: string }) =>
		api.get<{ notifications: Notification[]; unreadCount: number }>(
			`${API}/notifications`,
			{ params },
		),
	markRead: (notificationId: string) =>
		api.patch(`${API}/notifications/${notificationId}/read`),
	markAllRead: () => api.patch(`${API}/notifications/read-all`),
	subscribePush: (subscription: {
		endpoint: string;
		keys: { p256dh: string; auth: string };
	}) => api.post(`${API}/notifications/push/subscribe`, subscription),
};
