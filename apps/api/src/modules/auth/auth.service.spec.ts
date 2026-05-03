import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { UserRole, UserStatus } from "@repo/database";
import { createMockUser } from "@test/utils/factories";
import { PrismaService } from "prisma/prisma.service";
import {
	BadRequestException,
	ForbiddenException,
	NotFoundException,
} from "@/common/exceptions/business.exception";
import { AllowlistService } from "./allowlist/allowlist.service";
import { AuthService } from "./auth.service";

describe("AuthService", () => {
	let service: AuthService;
	let mockPrismaUser: any;

	const mockAllowlistService = {
		isAllowed: jest.fn(),
	};

	const mockConfigService = {
		get: jest.fn(),
		getOrThrow: jest.fn(),
	};

	beforeEach(async () => {
		mockPrismaUser = {
			findFirst: jest.fn(),
			findUnique: jest.fn(),
			create: jest.fn(),
			update: jest.fn(),
		};

		const mockPrismaService = {
			user: mockPrismaUser,
		};

		// Setup config service mocks
		mockConfigService.getOrThrow.mockImplementation((key: string) => {
			if (key === "webapp.authRedirectURL")
				return "http://localhost:3000/auth/callback";
			return null;
		});
		mockConfigService.get.mockImplementation((key: string) => {
			if (key === "SESSION_NAME") return "slotty.sid";
			return null;
		});

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				AuthService,
				{
					provide: PrismaService,
					useValue: mockPrismaService,
				},
				{
					provide: AllowlistService,
					useValue: mockAllowlistService,
				},
				{
					provide: ConfigService,
					useValue: mockConfigService,
				},
			],
		}).compile();

		service = module.get<AuthService>(AuthService);

		jest.clearAllMocks();
	});

	describe("handleGoogleLogin", () => {
		const mockProfile = {
			id: "google-id-123",
			emails: [{ value: "test@example.com" }],
			displayName: "Test User",
		} as any;

		it("should throw BadRequestException when email is missing", async () => {
			const profile = { ...mockProfile, emails: [] } as any;

			await expect(service.handleGoogleLogin(profile)).rejects.toThrow(
				BadRequestException,
			);
		});

		it("should throw ForbiddenException when user not in allowlist", async () => {
			mockAllowlistService.isAllowed.mockResolvedValue(false);

			await expect(service.handleGoogleLogin(mockProfile)).rejects.toThrow(
				ForbiddenException,
			);
		});

		it("should create new user when not exists", async () => {
			mockAllowlistService.isAllowed.mockResolvedValue(true);
			mockPrismaUser.findFirst.mockResolvedValue(null);

			const newUser = createMockUser({
				email: "test@example.com",
				googleId: "google-id-123",
				role: UserRole.student,
				status: UserStatus.active,
			});
			mockPrismaUser.create.mockResolvedValue(newUser);

			const result = await service.handleGoogleLogin(mockProfile);

			expect(result).toEqual(newUser);
			expect(mockPrismaUser.create).toHaveBeenCalled();
		});

		it("should throw ForbiddenException when existing user is disabled", async () => {
			mockAllowlistService.isAllowed.mockResolvedValue(true);

			const disabledUser = createMockUser({
				status: UserStatus.disabled,
			});
			mockPrismaUser.findFirst.mockResolvedValue(disabledUser);

			await expect(service.handleGoogleLogin(mockProfile)).rejects.toThrow(
				ForbiddenException,
			);
		});
	});

	describe("getSessionUser", () => {
		it("should throw BadRequestException when userId is missing", async () => {
			await expect(service.getSessionUser(undefined)).rejects.toThrow(
				BadRequestException,
			);
		});

		it("should throw NotFoundException when user not found", async () => {
			mockPrismaUser.findUnique.mockResolvedValue(null);

			await expect(service.getSessionUser("non-existent")).rejects.toThrow(
				NotFoundException,
			);
		});

		it("should return user when found", async () => {
			const user = createMockUser();
			mockPrismaUser.findUnique.mockResolvedValue(user);

			const result = await service.getSessionUser(user.id);

			expect(result).toEqual(user);
		});
	});
});
