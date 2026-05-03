import { Test, TestingModule } from "@nestjs/testing";
import { UserRole, UserStatus } from "@repo/database";
import { createMockUser } from "@test/utils/factories";
import { PrismaService } from "prisma/prisma.service";
import { ConflictException } from "@/common/exceptions/business.exception";
import { CreateUserDto } from "./dto/create-user.dto";
import { UsersService } from "./users.service";

describe("UsersService", () => {
	let service: UsersService;
	let mockPrisma: any;

	beforeEach(async () => {
		mockPrisma = {
			user: {
				findUnique: jest.fn(),
				findMany: jest.fn(),
				create: jest.fn(),
			},
		};

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				UsersService,
				{ provide: PrismaService, useValue: mockPrisma },
			],
		}).compile();

		service = module.get<UsersService>(UsersService);

		jest.clearAllMocks();
	});

	describe("createUser", () => {
		const dto: CreateUserDto = {
			name: "Test User",
			email: "TEST@EXAMPLE.COM",
			role: UserRole.student,
			status: UserStatus.active,
			roll_number: "12345",
		};

		it("should throw ConflictException when user already exists", async () => {
			const existingUser = createMockUser({ email: "test@example.com" });
			mockPrisma.user.findUnique.mockResolvedValue(existingUser);

			await expect(service.createUser(dto)).rejects.toThrow(ConflictException);
		});

		it("should create user with normalized email", async () => {
			mockPrisma.user.findUnique.mockResolvedValue(null);
			const newUser = createMockUser({
				email: "test@example.com",
				name: "Test User",
			});
			mockPrisma.user.create.mockResolvedValue(newUser);

			const result = await service.createUser(dto);

			expect(result).toEqual(newUser);
			expect(mockPrisma.user.create).toHaveBeenCalledWith({
				data: {
					name: "Test User",
					email: "test@example.com",
					role: UserRole.student,
					status: UserStatus.active,
					rollNumber: "12345",
				},
			});
		});

		it("should create user without roll number when not provided", async () => {
			mockPrisma.user.findUnique.mockResolvedValue(null);
			const newUser = createMockUser();
			mockPrisma.user.create.mockResolvedValue(newUser);

			const dtoWithoutRoll: CreateUserDto = {
				name: "Test User",
				email: "test@example.com",
				role: UserRole.student,
			};

			await service.createUser(dtoWithoutRoll);

			expect(mockPrisma.user.create).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({ rollNumber: null }),
				}),
			);
		});

		it("should use default status when not provided", async () => {
			mockPrisma.user.findUnique.mockResolvedValue(null);
			const newUser = createMockUser();
			mockPrisma.user.create.mockResolvedValue(newUser);

			const dtoWithoutStatus: CreateUserDto = {
				name: "Test User",
				email: "test@example.com",
				role: UserRole.student,
			};

			await service.createUser(dtoWithoutStatus);

			expect(mockPrisma.user.create).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({ status: "active" }),
				}),
			);
		});
	});

	describe("listUsers", () => {
		it("should return all users when no email provided", async () => {
			const users = [createMockUser(), createMockUser()];
			mockPrisma.user.findMany.mockResolvedValue(users);

			const result = await service.listUsers();

			expect(result).toEqual(users);
			expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
				orderBy: { createdAt: "desc" },
			});
		});

		it("should filter by email when provided", async () => {
			const users = [createMockUser({ email: "test@example.com" })];
			mockPrisma.user.findMany.mockResolvedValue(users);

			const result = await service.listUsers("TEST@EXAMPLE.COM");

			expect(result).toEqual(users);
			expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
				where: { email: { contains: "test@example.com" } },
				orderBy: { createdAt: "desc" },
			});
		});

		it("should return empty array when no users match", async () => {
			mockPrisma.user.findMany.mockResolvedValue([]);

			const result = await service.listUsers("nonexistent@example.com");

			expect(result).toEqual([]);
		});
	});

	describe("getUserById", () => {
		it("should throw ConflictException when user not found", async () => {
			mockPrisma.user.findUnique.mockResolvedValue(null);

			await expect(service.getUserById("non-existent")).rejects.toThrow(
				ConflictException,
			);
		});

		it("should return user when found", async () => {
			const user = createMockUser({ id: "user-id" });
			mockPrisma.user.findUnique.mockResolvedValue(user);

			const result = await service.getUserById("user-id");

			expect(result).toEqual(user);
		});
	});
});
