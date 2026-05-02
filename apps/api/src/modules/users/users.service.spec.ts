import { Test, TestingModule } from "@nestjs/testing";
import { UserRole, UserStatus } from "@prisma/client";
import { PrismaService } from "prisma/prisma.service";
import { ConflictException } from "@/common/exceptions/business.exception";
import { createMockUser } from "../../../test/utils/factories";
import { UsersService } from "./users.service";

describe("UsersService", () => {
	let service: UsersService;

	const mockPrismaService = {
		user: {
			findUnique: jest.fn(),
			findMany: jest.fn(),
			create: jest.fn(),
		},
	};

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				UsersService,
				{
					provide: PrismaService,
					useValue: mockPrismaService,
				},
			],
		}).compile();

		service = module.get<UsersService>(UsersService);

		jest.clearAllMocks();
	});

	describe("createUser", () => {
		const createUserDto = {
			name: "Test User",
			email: "test@example.com",
			role: UserRole.student as UserRole,
			status: UserStatus.active as UserStatus,
		};

		it("should throw ConflictException when user already exists", async () => {
			const existingUser = createMockUser({ email: "test@example.com" });

			mockPrismaService.user.findUnique.mockResolvedValue(existingUser);

			await expect(service.createUser(createUserDto)).rejects.toThrow(
				ConflictException,
			);
		});

		it("should create user successfully", async () => {
			const newUser = createMockUser({
				name: "Test User",
				email: "test@example.com",
				role: UserRole.student,
				status: UserStatus.active,
			});

			mockPrismaService.user.findUnique.mockResolvedValue(null);
			mockPrismaService.user.create.mockResolvedValue(newUser);

			const result = await service.createUser(createUserDto);

			expect(result).toEqual(newUser);
			expect(mockPrismaService.user.create).toHaveBeenCalledWith({
				data: {
					name: "Test User",
					email: "test@example.com",
					role: UserRole.student,
					status: UserStatus.active,
					rollNumber: null,
				},
			});
		});

		it("should create user with roll number when provided", async () => {
			const newUser = createMockUser({
				rollNumber: "R12345",
			});

			mockPrismaService.user.findUnique.mockResolvedValue(null);
			mockPrismaService.user.create.mockResolvedValue(newUser);

			const dto = { ...createUserDto, roll_number: "  R12345  " };

			await service.createUser(dto);

			expect(mockPrismaService.user.create).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({ rollNumber: "R12345" }),
				}),
			);
		});

		it("should use default status when not provided", async () => {
			mockPrismaService.user.findUnique.mockResolvedValue(null);
			mockPrismaService.user.create.mockResolvedValue(createMockUser());

			const dto = {
				name: "Test User",
				email: "test@example.com",
				role: UserRole.student,
			};

			await service.createUser(dto);

			expect(mockPrismaService.user.create).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({ status: "active" }),
				}),
			);
		});
	});

	describe("listUsers", () => {
		it("should return all users when no email filter", async () => {
			const users = [
				createMockUser({ email: "user1@example.com" }),
				createMockUser({ email: "user2@example.com" }),
			];

			mockPrismaService.user.findMany.mockResolvedValue(users);

			const result = await service.listUsers();

			expect(result).toEqual(users);
			expect(mockPrismaService.user.findMany).toHaveBeenCalledWith({
				orderBy: { createdAt: "desc" },
			});
		});

		it("should filter users by email", async () => {
			const users = [createMockUser({ email: "test@example.com" })];

			mockPrismaService.user.findMany.mockResolvedValue(users);

			const result = await service.listUsers("  TEST@EXAMPLE.COM  ");

			expect(result).toEqual(users);
			expect(mockPrismaService.user.findMany).toHaveBeenCalledWith({
				where: { email: { contains: "test@example.com" } },
				orderBy: { createdAt: "desc" },
			});
		});
	});

	describe("getUserById", () => {
		it("should throw ConflictException when user not found", async () => {
			mockPrismaService.user.findUnique.mockResolvedValue(null);

			await expect(service.getUserById("non-existent")).rejects.toThrow(
				ConflictException,
			);
		});

		it("should return user when found", async () => {
			const user = createMockUser();

			mockPrismaService.user.findUnique.mockResolvedValue(user);

			const result = await service.getUserById(user.id);

			expect(result).toEqual(user);
		});
	});
});
