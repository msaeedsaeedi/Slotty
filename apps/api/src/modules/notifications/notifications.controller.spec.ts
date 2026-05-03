import { Test, TestingModule } from "@nestjs/testing";
import { User } from "@repo/database";
import { RequestWithUser } from "@/modules/auth/auth.types";
import { PushSubscribeDto } from "./dto/push-subscribe.dto";
import { QueryNotificationsDto } from "./dto/query-notifications.dto";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";

describe("NotificationsController", () => {
	let controller: NotificationsController;
	let mockNotificationsService: any;

	const mockUser: User = {
		id: "user-1",
		email: "test@example.com",
		name: "Test User",
		role: "student",
		status: "active",
		googleId: null,
		rollNumber: null,
		deletedAt: null,
		createdAt: new Date(),
		updatedAt: new Date(),
	};

	const mockRequest = (user: User): RequestWithUser =>
		({ user }) as RequestWithUser;

	beforeEach(async () => {
		mockNotificationsService = {
			listNotifications: jest.fn(),
			markAsRead: jest.fn(),
			markAllAsRead: jest.fn(),
			storePushSubscription: jest.fn(),
			getUserSseStream: jest.fn(),
			notify: jest.fn(),
		};

		const module: TestingModule = await Test.createTestingModule({
			controllers: [NotificationsController],
			providers: [
				{ provide: NotificationsService, useValue: mockNotificationsService },
			],
		}).compile();

		controller = module.get<NotificationsController>(NotificationsController);
	});

	it("listNotifications returns data when user is present", async () => {
		const query: QueryNotificationsDto = { unread: true } as any;
		mockNotificationsService.listNotifications.mockResolvedValue({
			notifications: [],
		});

		const result = await controller.listNotifications(
			query,
			mockRequest(mockUser),
		);
		expect(result).toEqual({ notifications: [] });
		expect(mockNotificationsService.listNotifications).toHaveBeenCalled();
	});

	it("subscribePush should call service with mapped data when user present", async () => {
		const dto: PushSubscribeDto = {
			endpoint: "https://example.com/endpoint",
			keys: { p256dh: "p256", auth: "auth" },
		} as any;

		const req: any = { user: mockUser };
		await controller.subscribePush(dto, req);

		expect(mockNotificationsService.storePushSubscription).toHaveBeenCalled();
	});
});
