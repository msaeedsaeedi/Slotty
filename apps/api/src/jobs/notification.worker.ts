import {
	Injectable,
	Logger,
	OnModuleDestroy,
	OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Job, Worker } from "bullmq";
import pLimit from "p-limit";
import { PrismaService } from "prisma/prisma.service";
import webPush from "web-push";
import type { NotificationJob } from "@/modules/notifications/notifications.service";
import { attempt } from "@/utils/attempt.util";

@Injectable()
export class NotificationWorker implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new Logger(NotificationWorker.name);
	private worker!: Worker;

	constructor(
		private readonly configService: ConfigService,
		private readonly prisma: PrismaService,
	) {}

	// ── Worker setup ─────────────────────────────────────────────────────────

	onModuleInit() {
		const vapid = this.configService.get<{
			publicKey: string;
			privateKey: string;
			subject: string;
		}>("vapid");

		if (vapid?.publicKey && vapid?.privateKey && vapid?.subject) {
			webPush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
			this.logger.log("Web Push VAPID details configured");
		} else {
			this.logger.warn(
				"VAPID public key, private key, or subject not set. " +
					"Web Push notifications will not be sent.",
			);
		}

		// ── Worker ────────────────────────────────────────────────────────────
		this.worker = new Worker<NotificationJob>(
			"notification",
			async (job: Job<NotificationJob>) => {
				const { recipientId, type, channel, data } = job.data;

				this.logger.log(
					`Processing job ${job.id}: ${channel} notification (type: ${type}) for user ${recipientId}`,
				);

				/**
				 * Each job handles exactly ONE channel.
				 * This is intentional: if email succeeds but push fails, BullMQ only
				 * retries the push job — the email job is already marked complete and
				 * will not be re-sent.
				 */
				switch (channel) {
					case "email":
						await this.sendEmail(recipientId, type, data);
						break;
					case "push":
						await this.sendPush(recipientId, type, data);
						break;
					default: {
						// Exhaustiveness guard — TypeScript should prevent this.
						const _exhaustive: never = channel;
						this.logger.warn(`Unknown notification channel: ${_exhaustive}`);
					}
				}
			},
			{
				connection: {
					url: this.configService.getOrThrow<string>("REDIS_URL"),
				},
				concurrency: 10,
			},
		);

		this.worker.on("completed", (job) => {
			this.logger.log(`Job ${job.id} completed`);
		});

		this.worker.on("failed", (job, err) => {
			this.logger.error(
				`Job ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`,
			);
		});
	}

	// ── Email delivery ────────────────────────────────────────────────────────

	/**
	 * TODO: Implement real email sending logic.
	 * Send an email notification via Nodemailer.
	 */
	private async sendEmail(
		recipientId: string,
		type: string,
		data: Record<string, unknown>,
	): Promise<void> {
		// 1. Resolve the user's email address.
		const user = await this.prisma.user.findUnique({
			where: { id: recipientId },
			select: { email: true, name: true },
		});

		if (!user) {
			// User was deleted after the job was enqueued — drop silently.
			return;
		}

		this.logger.log(`[EMAIL STUB] Would send "${type}" email to ${user.email}`);
	}

	// ── Web Push delivery ─────────────────────────────────────────────────────

	/**
	 * Send a Web Push notification to all active subscriptions for a user.
	 *
	 * Uses p-limit to cap concurrency at 10 parallel push requests.
	 * Stale subscriptions (410 Gone) are removed from the database automatically.
	 * Other transient errors are logged but do not fail the job — a single bad
	 * subscription should not block delivery to other devices.
	 */
	private async sendPush(
		recipientId: string,
		type: string,
		data: Record<string, unknown>,
	): Promise<void> {
		const subscriptions = await this.prisma.pushSubscription.findMany({
			where: { userId: recipientId },
		});

		if (subscriptions.length === 0) {
			this.logger.debug(`No push subscriptions for user ${recipientId}`);
			return;
		}

		const limit = pLimit(10);
		const payload = JSON.stringify({ type, data });

		await Promise.all(
			subscriptions.map((sub) =>
				limit(async () => {
					const [error] = await attempt(
						webPush.sendNotification(
							{
								endpoint: sub.endpoint,
								keys: { p256dh: sub.p256dh, auth: sub.auth },
							},
							payload,
						),
					);

					if (error) {
						const statusCode = (error as { statusCode?: number }).statusCode;

						if (statusCode === 410 || statusCode === 404) {
							// Subscription is expired or no longer valid — clean it up.
							this.logger.warn(
								`Removing stale push subscription ${sub.endpoint} (HTTP ${statusCode})`,
							);
							await this.prisma.pushSubscription
								.delete({ where: { endpoint: sub.endpoint } })
								.catch(() => {
									/* ignore race condition on double-delete */
								});
						} else {
							// Transient error — log but don't fail the whole job.
							// The BullMQ retry will re-attempt the remaining subscriptions.
							this.logger.error(
								`Push to ${sub.endpoint} failed (HTTP ${statusCode ?? "unknown"}): ${(error as Error).message}`,
							);
						}
					}
				}),
			),
		);
	}

	// ── Lifecycle ─────────────────────────────────────────────────────────────

	async onModuleDestroy() {
		await this.worker?.close();
	}
}
