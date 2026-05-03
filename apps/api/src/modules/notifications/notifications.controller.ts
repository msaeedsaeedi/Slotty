import {
	Body,
	Controller,
	Get,
	HttpCode,
	HttpStatus,
	MessageEvent,
	Param,
	ParseUUIDPipe,
	Patch,
	Post,
	Query,
	Req,
	Sse,
} from "@nestjs/common";
import {
	ApiBody,
	ApiOperation,
	ApiParam,
	ApiResponse,
	ApiTags,
} from "@nestjs/swagger";
import { Observable } from "rxjs";
import { RequestWithUser } from "@/modules/auth/auth.types";
import { Roles } from "@/modules/auth/decorators/roles.decorator";
import { CreateNotificationDto } from "./dto/create-notification.dto";
import { PushSubscribeDto } from "./dto/push-subscribe.dto";
import { QueryNotificationsDto } from "./dto/query-notifications.dto";
import { NotificationsService } from "./notifications.service";

@ApiTags("Notifications")
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
	@ApiOperation({ summary: "List notifications for the current user" })
	@ApiResponse({ status: 200, description: "List of notifications" })
	@Roles("student", "ta")
	async listNotifications(
		@Query() query: QueryNotificationsDto,
		@Req() req: RequestWithUser,
	) {
		return this.notificationsService.listNotifications(req.user.id, {
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
	@ApiOperation({ summary: "Mark a notification as read" })
	@ApiParam({
		name: "notificationId",
		description: "UUID of the notification",
		format: "uuid",
	})
	@ApiResponse({ status: 200, description: "Notification marked as read" })
	@Roles("student", "ta")
	async markAsRead(
		@Param("notificationId", ParseUUIDPipe) notificationId: string,
		@Req() req: RequestWithUser,
	) {
		return this.notificationsService.markAsRead(notificationId, req.user.id);
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
	@ApiOperation({ summary: "Mark all notifications as read" })
	@ApiResponse({ status: 200, description: "All notifications marked as read" })
	@Roles("student", "ta")
	async markAllAsRead(@Req() req: RequestWithUser) {
		return this.notificationsService.markAllAsRead(req.user.id);
	}

	/**
	 * POST /api/v1/notifications/push/subscribe
	 * Register a Web Push subscription for the current user.
	 * Available to both students and TAs — both receive venue-change and
	 * reminder notifications.
	 */
	@Post("push/subscribe")
	@HttpCode(HttpStatus.NO_CONTENT)
	@ApiOperation({ summary: "Subscribe to Web Push notifications" })
	@ApiBody({ type: PushSubscribeDto })
	@ApiResponse({ status: 204, description: "Push subscription registered" })
	@Roles("student", "ta")
	async subscribePush(
		@Body() dto: PushSubscribeDto,
		@Req() req: RequestWithUser,
	) {
		await this.notificationsService.storePushSubscription({
			userId: req.user.id,
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
	@ApiOperation({ summary: "SSE stream for real-time notifications" })
	@ApiResponse({ status: 200, description: "SSE stream" })
	@Roles("student", "ta")
	sse(@Req() req: RequestWithUser): Observable<MessageEvent> {
		return this.notificationsService.getUserSseStream(req.user.id);
	}

	/**
	 * POST /api/v1/notifications
	 * Admin-only endpoint to send an arbitrary notification to any user.
	 * Used for testing and manual administrative messages.
	 */
	@Post()
	@ApiOperation({ summary: "Send a notification (admin only)" })
	@ApiBody({ type: CreateNotificationDto })
	@ApiResponse({ status: 201, description: "Notification sent" })
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
