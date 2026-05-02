import { createHash } from "node:crypto";
import { InjectQueue } from "@nestjs/bullmq";
import {
	Injectable,
	Logger,
	MessageEvent,
	NotFoundException,
	OnModuleDestroy,
} from "@nestjs/common";
import { NotificationType, Prisma } from "@prisma/client";
import { InputJsonValue } from "@prisma/client/runtime/client";
import { Queue } from "bullmq";
import { PrismaService } from "prisma/prisma.service";
import { Observable, Subject } from "rxjs";

// ─── Shared types ────────────────────────────────────────────────────────────

export const VALID_CHANNELS = ["email", "inapp", "push"] as const;
export type NotificationChannel = (typeof VALID_CHANNELS)[number];

export interface NotificationJob {
	recipientId: string;
	type: NotificationType;
	/** Only external channels (email | push). inapp is handled synchronously. */
	channel: "email" | "push";
	data: Record<string, unknown>;
	/** DB notification ID — used as the BullMQ job-id prefix for idempotency. */
	notificationId: string;
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class NotificationsService implements OnModuleDestroy {
	private readonly logger = new Logger(NotificationsService.name);

	/**
	 * Per-user SSE subjects.
	 * Key: userId — Value: Subject that emits MessageEvents to active SSE clients.
	 * Multiple browser tabs for the same user share one subject; the Observable
	 * returned by getUserSseStream() creates one subscription per tab and cleans
	 * up individually on disconnect.
	 */
	private readonly sseSubjects = new Map<string, Subject<MessageEvent>>();

	constructor(
		private readonly prisma: PrismaService,
		@InjectQueue("notification") private readonly notificationQueue: Queue,
	) {}

	//── Primary notification API ──────────────────────────────────────────────

	/**
	 * Persist an in-app notification, push it via SSE, and enqueue external
	 * channels (email, push) for async delivery.
	 *
	 * This is the single entry-point called by other modules.
	 */
	async notify(params: {
		userId: string;
		type: NotificationType;
		title: string;
		body: string;
		data?: Record<string, unknown>;
		channels?: NotificationChannel[];
	}): Promise<Prisma.NotificationGetPayload<object>> {
		const {
			userId,
			type,
			title,
			body,
			data = {},
			channels = ["inapp", "email"],
		} = params;

		// 1. Always persist — the DB record is the source of truth for in-app.
		const notification = await this.prisma.notification.create({
			data: { userId, type, title, body, data: data as InputJsonValue },
		});

		// 2. Push to SSE immediately so the browser updates without polling.
		this.pushSseEvent(userId, {
			data: { notification },
			type: "notification",
		} as unknown as MessageEvent);

		// 3. Enqueue one job per external channel so each retries independently.
		const externalChannels = channels.filter(
			(c): c is "email" | "push" => c !== "inapp",
		);
		await Promise.all(
			externalChannels.map((channel) =>
				this.enqueueNotification({
					recipientId: userId,
					type,
					channel,
					data: { ...data, notificationId: notification.id },
					notificationId: notification.id,
				}),
			),
		);

		return notification;
	}

	// ── Read / query ──────────────────────────────────────────────────────────

	/**
	 * List notifications for a user with cursor-based pagination.
	 */
	async listNotifications(
		userId: string,
		params?: {
			unreadOnly?: boolean;
			cursor?: string;
			limit?: number;
		},
	) {
		const { unreadOnly = false, cursor, limit = 20 } = params ?? {};

		const where: Prisma.NotificationWhereInput = {
			userId,
			...(unreadOnly ? { readAt: null } : {}),
		};

		// Run list query and unread count in a single round-trip.
		const [notifications, unreadCount] = await this.prisma.$transaction([
			this.prisma.notification.findMany({
				where,
				orderBy: { createdAt: "desc" },
				take: limit + 1,
				// Prisma cursor pagination: skip the cursor row itself.
				...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
			}),
			this.prisma.notification.count({ where: { userId, readAt: null } }),
		]);

		const hasMore = notifications.length > limit;
		const items = hasMore ? notifications.slice(0, -1) : notifications;
		const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;

		return {
			notifications: items,
			meta: { hasMore, nextCursor, unreadCount },
		};
	}

	// ── Mutations ─────────────────────────────────────────────────────────────

	/**
	 * Mark a single notification as read. Verifies ownership before updating.
	 * Returns the notification unchanged when it is already read (idempotent).
	 */
	async markAsRead(notificationId: string, userId: string) {
		const notification = await this.prisma.notification.findUnique({
			where: { id: notificationId },
		});

		// Unified 404 — do not leak whether the record belongs to another user.
		if (!notification || notification.userId !== userId) {
			throw new NotFoundException(`Notification ${notificationId} not found`);
		}

		if (notification.readAt) {
			// Already read — return as-is for idempotency.
			return notification;
		}

		return this.prisma.notification.update({
			where: { id: notificationId },
			data: { readAt: new Date() },
		});
	}

	/**
	 * Mark all unread notifications as read for a user.
	 */
	async markAllAsRead(userId: string) {
		const result = await this.prisma.notification.updateMany({
			where: { userId, readAt: null },
			data: { readAt: new Date() },
		});
		return { updated: result.count };
	}

	// ── Web Push subscriptions ────────────────────────────────────────────────

	/**
	 * Upsert a Web Push subscription keyed on endpoint (endpoint is globally
	 * unique per browser/device). Re-subscribing with the same endpoint updates
	 * the keys in case the browser rotated them.
	 */
	async storePushSubscription(params: {
		userId: string;
		endpoint: string;
		p256dh: string;
		auth: string;
	}) {
		return this.prisma.pushSubscription.upsert({
			where: { endpoint: params.endpoint },
			update: {
				userId: params.userId,
				p256dh: params.p256dh,
				auth: params.auth,
			},
			create: {
				userId: params.userId,
				endpoint: params.endpoint,
				p256dh: params.p256dh,
				auth: params.auth,
			},
		});
	}

	// ── SSE ───────────────────────────────────────────────────────────────────

	/**
	 * Returns an Observable that the controller hands to NestJS's @Sse() handler.
	 *
	 * - Emits a "connected" event immediately so the client knows the stream is live.
	 * - Emits a heartbeat every 25 s (safely below most 30-second proxy timeouts).
	 * - Emits real-time notification events pushed via pushSseEvent().
	 * - Cleans up interval and subscription when the client disconnects.
	 */
	getUserSseStream(userId: string): Observable<MessageEvent> {
		return new Observable<MessageEvent>((subscriber) => {
			// Create the subject on first connection; reuse across tabs.
			if (!this.sseSubjects.has(userId)) {
				this.sseSubjects.set(userId, new Subject<MessageEvent>());
			}
			const subject = this.sseSubjects.get(userId)!;

			// Immediate "connected" event — lets the client verify the stream.
			subscriber.next({
				data: { type: "connected", timestamp: new Date().toISOString() },
				type: "heartbeat",
			} as unknown as MessageEvent);

			// Forward events from the shared subject to this subscriber.
			const sub = subject.subscribe({
				next: (event) => subscriber.next(event),
				error: (err) => subscriber.error(err),
			});

			// Keep-alive heartbeat.
			const heartbeatInterval = setInterval(() => {
				subscriber.next({
					data: { type: "heartbeat", timestamp: new Date().toISOString() },
					type: "heartbeat",
				} as unknown as MessageEvent);
			}, 25_000);

			// Teardown — runs when the client disconnects or the observable is unsubscribed.
			return () => {
				sub.unsubscribe();
				clearInterval(heartbeatInterval);
				// Remove the subject only once no tabs remain subscribed.
				if (!this.sseSubjects.get(userId)?.observed) {
					this.sseSubjects.delete(userId);
				}
			};
		});
	}

	/**
	 * Emit a real-time event to all active SSE connections for a user.
	 * No-ops silently when the user has no active stream (e.g., mobile app).
	 */
	private pushSseEvent(userId: string, event: MessageEvent): void {
		this.sseSubjects.get(userId)?.next(event);
	}

	// ── Queue ─────────────────────────────────────────────────────────────────

	/**
	 * Enqueue a single-channel delivery job.
	 *
	 * Job ID is derived from notificationId + channel so the same notification
	 * can never be enqueued twice for the same channel (idempotent on retry).
	 */
	async enqueueNotification(params: NotificationJob): Promise<void> {
		const jobId = createHash("sha256")
			.update(`${params.notificationId}:${params.channel}`)
			.digest("hex")
			.slice(0, 32);

		await this.notificationQueue.add("send-notification", params, {
			jobId,
			attempts: 3,
			backoff: { type: "exponential", delay: 5_000 },
			removeOnComplete: { count: 500 },
			removeOnFail: { count: 100 },
		});

		this.logger.log(
			`Enqueued ${params.channel} job ${jobId} for user ${params.recipientId} (type: ${params.type})`,
		);
	}

	// ── Lifecycle ─────────────────────────────────────────────────────────────

	async onModuleDestroy() {
		// Close the queue producer (does not affect worker connections).
		await this.notificationQueue.close();

		// Complete all SSE subjects so connected clients receive a proper close.
		for (const subject of this.sseSubjects.values()) {
			subject.complete();
		}
		this.sseSubjects.clear();
	}
}
