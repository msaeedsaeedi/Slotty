import { ForbiddenException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { attempt } from "@/utils/attempt.util";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";

jest.mock("@/utils/attempt.util");

describe("AuthController", () => {
	let controller: AuthController;
	let mockAuthService: any;

	beforeEach(async () => {
		mockAuthService = {
			handleGoogleLogin: jest.fn(),
			getWebAppUrl: jest.fn().mockReturnValue("http://localhost:3000"),
			getSessionName: jest.fn().mockReturnValue("slotty.sid"),
			getSessionUser: jest.fn(),
		};

		(attempt as jest.Mock).mockImplementation((promise) =>
			promise.then(
				(data: any) => [null, data],
				(err: any) => [err, null],
			),
		);

		const module: TestingModule = await Test.createTestingModule({
			controllers: [AuthController],
			providers: [{ provide: AuthService, useValue: mockAuthService }],
		}).compile();

		controller = module.get<AuthController>(AuthController);

		jest.clearAllMocks();
	});

	describe("googleLogin", () => {
		it("should do nothing when guard passes", async () => {
			const result = await controller.googleLogin();
			expect(result).toBeUndefined();
		});
	});

	describe("googleCallback", () => {
		const mockProfile = {
			id: "google-id",
			emails: [{ value: "test@example.com" }],
			displayName: "Test User",
		} as any;

		it("should redirect on successful login", async () => {
			(attempt as jest.Mock).mockResolvedValue([null, mockProfile]);
			mockAuthService.handleGoogleLogin.mockResolvedValue(mockProfile);

			const mockRes = { redirect: jest.fn() } as any;
			await controller.googleCallback({ user: mockProfile } as any, mockRes);

			expect(mockRes.redirect).toHaveBeenCalledWith("http://localhost:3000");
		});

		it("should throw ForbiddenException on auth failure", async () => {
			(attempt as jest.Mock).mockResolvedValue([
				new Error("Auth failed"),
				null,
			]);

			await expect(
				controller.googleCallback(
					{ user: mockProfile } as any,
					{ redirect: jest.fn() } as any,
				),
			).rejects.toThrow(ForbiddenException);
		});
	});

	describe("logout", () => {
		it("should destroy session and clear cookie", async () => {
			const mockSession = {
				destroy: jest.fn((callback) => callback(null)),
			};

			const mockRes = {
				clearCookie: jest.fn(),
			} as any;

			await controller.logout({ session: mockSession } as any, mockRes);

			expect(mockSession.destroy).toHaveBeenCalled();
			expect(mockRes.clearCookie).toHaveBeenCalledWith("slotty.sid");
		});
	});

	describe("me", () => {
		it("should return user when session is valid", async () => {
			const user = { id: "user-id", email: "test@example.com" };
			mockAuthService.getSessionUser.mockResolvedValue(user);

			const result = await controller.me({
				session: { userId: "user-id" },
			} as any);

			expect(result).toEqual({ user });
		});
	});
});
