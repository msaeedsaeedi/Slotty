import {
	Body,
	Controller,
	Get,
	HttpCode,
	HttpStatus,
	MessageEvent,
	NotFoundException,
	Param,
	ParseUUIDPipe,
	Patch,
	Post,
	Query,
	Req,
	Sse,
} from "@nestjs/common";
import { User } from "@prisma/client";
import { Observable } from "rxjs";
import { Roles } from "@/modules/auth/decorators/roles.decorator";
import { CreateNotificationDto } from "./dto/create-notification.dto";
import { PushSubscribeDto } from "./dto/push-subscribe.dto";
import { QueryNotificationsDto } from "./dto/query-notifications.dto";
import { NotificationsService } from "./notifications.service";

interface RequestWithUser extends Request {
	user?: User;
}

@Controller({
	path: "notifications",
	version: "1",
})
export class NotificationsController {
	constructor(private readonly notificationsService: NotificationsService) {}

	/**
	 * GET /api/v1/notifications
	 * List notifications for the current user.
	 * Query params: ?unread=true&limit=20&cursor=<uuid>
	 */
	@Get()
	@Roles("student", "ta")
	async listNotifications(
		@Query() query: QueryNotificationsDto,
		@Req() req: RequestWithUser,
	) {
		const user = requireUser(req);

		return this.notificationsService.listNotifications(user.id, {
			unreadOnly: query.unread,
			cursor: query.cursor,
			limit: query.limit,
		});
	}

	/**
	 * PATCH /api/v1/notifications/:notificationId/read
	 * Mark a specific notification as read.
	 */
	@Patch(":notificationId/read")
	@Roles("student", "ta")
	async markAsRead(
		@Param("notificationId", ParseUUIDPipe) notificationId: string,
		@Req() req: RequestWithUser,
	) {
		const user = requireUser(req);
		return this.notificationsService.markAsRead(notificationId, user.id);
	}

	/**
	 * PATCH /api/v1/notifications/read-all
	 * Mark all notifications as read for the current user.
	 *
	 * Note: route ordering matters — this must be declared BEFORE ":notificationId/read"
	 * so Express doesn't interpret "read-all" as a UUID param. In NestJS with version
	 * routing the current ordering is fine, but keep this in mind during refactors.
	 */
	@Patch("read-all")
	@Roles("student", "ta")
	async markAllAsRead(@Req() req: RequestWithUser) {
		const user = requireUser(req);
		return this.notificationsService.markAllAsRead(user.id);
	}

	/**
	 * POST /api/v1/notifications/push/subscribe
	 * Register a Web Push subscription for the current user.
	 * Available to both students and TAs — both receive venue-change and
	 * reminder notifications.
	 */
	@Post("push/subscribe")
	@HttpCode(HttpStatus.NO_CONTENT)
	@Roles("student", "ta")
	async subscribePush(
		@Body() dto: PushSubscribeDto,
		@Req() req: RequestWithUser,
	) {
		const user = requireUser(req);

		await this.notificationsService.storePushSubscription({
			userId: user.id,
			endpoint: dto.endpoint,
			p256dh: dto.keys.p256dh,
			auth: dto.keys.auth,
		});
	}

	/**
	 * GET /api/v1/notifications/sse
	 * Server-Sent Events stream for real-time notification delivery.
	 *
	 * The service maintains a per-user RxJS Subject. When notify() is called
	 * anywhere in the application (e.g. after a booking is confirmed or a venue
	 * changes), the new notification is pushed directly to this stream so the
	 * client updates without polling. A heartbeat is emitted every 25 seconds to
	 * prevent proxy timeouts.
	 *
	 * Cleanup (interval + subscription) is handled by the Observable teardown
	 * logic inside getUserSseStream(), which runs when the client disconnects.
	 */
	@Sse("sse")
	@Roles("student", "ta")
	sse(@Req() req: RequestWithUser): Observable<MessageEvent> {
		const user = requireUser(req);
		return this.notificationsService.getUserSseStream(user.id);
	}

	/**
	 * POST /api/v1/notifications
	 * Admin-only endpoint to send an arbitrary notification to any user.
	 * Used for testing and manual administrative messages.
	 */
	@Post()
	@Roles("admin")
	async createNotification(@Body() dto: CreateNotificationDto) {
		return this.notificationsService.notify({
			userId: dto.userId,
			type: dto.type,
			title: dto.title,
			body: dto.body,
			data: dto.data,
			channels: dto.channels,
		});
	}
}

/**
 * Extract the authenticated user from the request.
 * Throws a NotFoundException if the user is not found.
 */
function requireUser(req: RequestWithUser): User {
	if (!req.user) {
		throw new NotFoundException("Authenticated user not found in request");
	}
	return req.user;
}
