import { Test, TestingModule } from "@nestjs/testing";
import { User } from "@repo/database";
import { CreateUserDto } from "./dto/create-user.dto";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

describe("UsersController", () => {
	let controller: UsersController;
	let mockUsersService: any;

	const mockUser: User = {
		id: "user-id",
		email: "test@example.com",
		name: "Test User",
		role: "student",
		status: "active",
		googleId: null,
		rollNumber: null,
		deletedAt: null,
		createdAt: new Date(),
		updatedAt: new Date(),
	} as any;

	beforeEach(async () => {
		mockUsersService = {
			createUser: jest.fn(),
			listUsers: jest.fn(),
			getUserById: jest.fn(),
		};

		const module: TestingModule = await Test.createTestingModule({
			controllers: [UsersController],
			providers: [{ provide: UsersService, useValue: mockUsersService }],
		}).compile();

		controller = module.get<UsersController>(UsersController);
		jest.clearAllMocks();
	});

	it("listUsers should return users list", async () => {
		const users = [mockUser];
		mockUsersService.listUsers.mockResolvedValue(users as any);

		const result = await controller.listUsers(undefined as any);

		expect(result).toEqual({ users });
		expect(mockUsersService.listUsers).toHaveBeenCalledWith(undefined);
	});

	it("getUser should return a user by id", async () => {
		const user = mockUser;
		mockUsersService.getUserById.mockResolvedValue(user as any);

		const result = await controller.getUser("user-id" as any);

		expect(result).toEqual({ user });
		expect(mockUsersService.getUserById).toHaveBeenCalledWith("user-id");
	});

	it("createUser should create and return a user", async () => {
		const dto: CreateUserDto = {
			name: "New User",
			email: "new@example.com",
			role: "student",
		} as any;

		const created = { ...dto, id: "new-id" } as any;
		mockUsersService.createUser.mockResolvedValue(created);

		const result = await controller.createUser(dto as any);

		expect(result).toEqual({ user: created });
		expect(mockUsersService.createUser).toHaveBeenCalledWith(dto);
	});
});
