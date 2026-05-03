import { Test, TestingModule } from "@nestjs/testing";
import { User } from "@repo/database";
import { RequestWithUser } from "@/modules/auth/auth.types";
import { AssignmentController } from "./assignments.controller";
import { AssignmentsService } from "./assignments.service";
import { CreateAssignmentDto } from "./dto/create-assignment.dto";

describe("AssignmentController", () => {
	let controller: AssignmentController;
	let mockAssignmentsService: any;

	const mockUser: User = {
		id: "user-1",
		email: "test@example.com",
		name: "Test User",
		role: "ta",
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
		mockAssignmentsService = {
			createAssignment: jest.fn(),
		};

		const module: TestingModule = await Test.createTestingModule({
			controllers: [AssignmentController],
			providers: [
				{ provide: AssignmentsService, useValue: mockAssignmentsService },
			],
		}).compile();

		controller = module.get<AssignmentController>(AssignmentController);
	});

	it("createAssignment should call service and return assignment when user present", async () => {
		const dto: CreateAssignmentDto = {
			title: "Test Assignment",
			demo_window_start: new Date(),
			demo_window_end: new Date(Date.now() + 1000 * 60 * 60),
			slot_duration_min: 60,
			slot_capacity: 3,
			freeze_before_min: 0,
			max_cancellations: 0,
		} as any;

		const created = { id: "assign-1" } as any;

		// @ts-ignore
		mockAssignmentsService.createAssignment.mockResolvedValue(created);

		const result = await controller.createAssignment(
			"course-id",
			dto,
			mockRequest(mockUser),
		);

		expect(result).toEqual({ assignment: created });
		expect(mockAssignmentsService.createAssignment).toHaveBeenCalledWith(
			"course-id",
			dto,
			mockUser,
		);
	});
});
