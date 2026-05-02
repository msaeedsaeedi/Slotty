import { Test, TestingModule } from "@nestjs/testing";
import { UnauthorizedException } from "@/common/exceptions/business.exception";
import { AssignmentController } from "./assignments.controller";
import { AssignmentsService } from "./assignments.service";
import { CreateAssignmentDto } from "./dto/create-assignment.dto";

describe("AssignmentController", () => {
	let controller: AssignmentController;
	let mockAssignmentsService: any;

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

	it("createAssignment should throw UnauthorizedException when no user", async () => {
		const dto: CreateAssignmentDto = {
			title: "Test Assignment",
			demo_window_start: new Date(),
			demo_window_end: new Date(Date.now() + 1000 * 60 * 60),
			slot_duration_min: 60,
			slot_capacity: 3,
			freeze_before_min: 0,
			max_cancellations: 0,
		} as any;

		await expect(
			controller.createAssignment("course-id", dto, { user: undefined } as any),
		).rejects.toBeInstanceOf(UnauthorizedException);
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

		const mockUser = { id: "user-1" } as any;
		const created = { id: "assign-1" } as any;

		// @ts-ignore
		mockAssignmentsService.createAssignment.mockResolvedValue(created);

		const result = await controller.createAssignment("course-id", dto, {
			user: mockUser,
		} as any);

		expect(result).toEqual({ assignment: created });
		expect(mockAssignmentsService.createAssignment).toHaveBeenCalledWith(
			"course-id",
			dto,
			mockUser,
		);
	});
});
