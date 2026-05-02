import { Queue } from "bullmq";
import { NotificationsService } from "./notifications.service";

describe("NotificationsService (unit)", () => {
	let service: NotificationsService;
	let mockPrisma: any;
	let mockQueue: Partial<Queue>;

	beforeEach(() => {
		mockPrisma = {
			notification: {
				create: jest.fn(),
				findMany: jest.fn(),
				count: jest.fn(),
				findUnique: jest.fn(),
				update: jest.fn(),
				updateMany: jest.fn(),
			},
			pushSubscription: {
				upsert: jest.fn(),
			},
			$transaction: jest.fn(),
		} as any;

		mockQueue = {
			add: jest.fn(),
			close: jest.fn(),
		} as any;

		// Directly instantiate without DI
		service = new (NotificationsService as any)(mockPrisma, mockQueue);
	});

	it("notify creates a notification and enqueues external channels", async () => {
		mockPrisma.notification.create.mockResolvedValue({ id: "notif-1" } as any);
		const spy = jest
			.spyOn(service, "enqueueNotification")
			.mockResolvedValue(undefined as any);
		const res = await service.notify({
			userId: "u1",
			type: 0 as any,
			title: "t",
			body: "b",
		} as any);
		expect(res).toBeDefined();
		expect(mockPrisma.notification.create).toHaveBeenCalled();
		expect(spy).toHaveBeenCalled();
		spy.mockRestore();
	});

	it("listNotifications returns mapped result", async () => {
		mockPrisma.$transaction.mockResolvedValue([
			[{ id: "n1" }, { id: "n2" }],
			1,
		] as any);
		const res = await service.listNotifications("u1", {
			unreadOnly: true,
			limit: 5,
		} as any);
		expect(res).toHaveProperty("notifications");
		expect(res).toHaveProperty("meta");
	});

	it("markAllAsRead returns updated count", async () => {
		mockPrisma.notification.updateMany.mockResolvedValue({ count: 3 } as any);
		const res = await service.markAllAsRead("u1");
		expect(res).toEqual({ updated: 3 });
	});

	it("storePushSubscription calls upsert with proper data", async () => {
		mockPrisma.pushSubscription.upsert.mockResolvedValue({ id: "sub" } as any);
		const res = await service.storePushSubscription({
			userId: "u1",
			endpoint: "ep",
			p256dh: "p",
			auth: "a",
		} as any);
		expect(res).toBeDefined();
		expect(mockPrisma.pushSubscription.upsert).toHaveBeenCalled();
	});

	it("enqueueNotification enqueues a job", async () => {
		const job = {
			recipientId: "u1",
			type: 0 as any,
			channel: "email" as any,
			data: { foo: "bar", notificationId: "n1" },
			notificationId: "n1",
		} as any;
		await (service as any).enqueueNotification(job);
		expect(mockQueue.add as any).toHaveBeenCalledWith(
			"send-notification",
			job,
			expect.any(Object),
		);
	});
});
