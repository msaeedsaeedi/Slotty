import { Test, TestingModule } from "@nestjs/testing";
import {
	createMockAssignment,
	createMockCourse,
	createMockUser,
} from "@test/utils/factories";
import { PrismaService } from "prisma/prisma.service";
import {
	BadRequestException,
	ForbiddenException,
	NotFoundException,
} from "@/common/exceptions/business.exception";
import { AuditService } from "@/modules/audit/audit.service";
import { AssignmentsService } from "./assignments.service";

describe("AssignmentsService", () => {
	let service: AssignmentsService;
	// biome-ignore lint/correctness/noUnusedVariables: <False Positive - used>
	let auditService: jest.Mocked<AuditService>;

	const mockPrismaService = {
		course: {
			findUnique: jest.fn(),
		},
		assignment: {
			create: jest.fn(),
		},
		enrollment: {
			findFirst: jest.fn(),
		},
	};

	const mockAuditService = {
		append: jest.fn().mockResolvedValue(undefined),
	};

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				AssignmentsService,
				{
					provide: PrismaService,
					useValue: mockPrismaService,
				},
				{
					provide: AuditService,
					useValue: mockAuditService,
				},
			],
		}).compile();

		service = module.get<AssignmentsService>(AssignmentsService);
		auditService = module.get(AuditService) as jest.Mocked<AuditService>;

		jest.clearAllMocks();
	});

	describe("createAssignment", () => {
		const createAssignmentDto = {
			title: "Test Assignment",
			demo_window_start: new Date(Date.now() + 86400000), // Tomorrow
			demo_window_end: new Date(Date.now() + 172800000), // Day after tomorrow
			slot_duration_min: 30,
			slot_capacity: 1,
			freeze_before_min: 60,
			max_cancellations: 2,
			is_published: false,
		};

		it("should throw NotFoundException when course not found", async () => {
			mockPrismaService.course.findUnique.mockResolvedValue(null);

			const actor = createMockUser({ role: "instructor" });

			await expect(
				service.createAssignment("non-existent", createAssignmentDto, actor),
			).rejects.toThrow(NotFoundException);
		});

		it("should throw ForbiddenException when instructor does not own course", async () => {
			const course = createMockCourse({ ownerId: "other-instructor-id" });

			mockPrismaService.course.findUnique.mockResolvedValue(course);

			const actor = createMockUser({
				role: "instructor",
				id: "different-instructor-id",
			});

			await expect(
				service.createAssignment(course.id, createAssignmentDto, actor),
			).rejects.toThrow(ForbiddenException);
		});

		it("should throw ForbiddenException when student tries to create assignment", async () => {
			const course = createMockCourse();

			mockPrismaService.course.findUnique.mockResolvedValue(course);

			const actor = createMockUser({ role: "student" });

			await expect(
				service.createAssignment(course.id, createAssignmentDto, actor),
			).rejects.toThrow(ForbiddenException);
		});

		it("should throw BadRequestException when demo window end is before start", async () => {
			const course = createMockCourse({ ownerId: "instructor-id" });

			mockPrismaService.course.findUnique.mockResolvedValue(course);

			const actor = createMockUser({
				role: "instructor",
				id: "instructor-id",
			});
			const dto = {
				...createAssignmentDto,
				demo_window_end: new Date(Date.now() - 86400000), // Yesterday
			};

			await expect(
				service.createAssignment(course.id, dto, actor),
			).rejects.toThrow(BadRequestException);
		});

		it("should create assignment for instructor", async () => {
			const course = createMockCourse({ ownerId: "instructor-id" });
			const assignment = createMockAssignment({ courseId: course.id });

			mockPrismaService.course.findUnique.mockResolvedValue(course);
			mockPrismaService.assignment.create.mockResolvedValue(assignment);

			const actor = createMockUser({
				role: "instructor",
				id: "instructor-id",
			});

			const result = await service.createAssignment(
				course.id,
				createAssignmentDto,
				actor,
			);

			expect(result).toEqual(assignment);
			expect(mockPrismaService.assignment.create).toHaveBeenCalledWith({
				data: expect.objectContaining({
					courseId: course.id,
					title: createAssignmentDto.title.trim(),
					demoWindowStart: createAssignmentDto.demo_window_start,
					demoWindowEnd: createAssignmentDto.demo_window_end,
				}),
			});
		});

		it("should create assignment for admin", async () => {
			const course = createMockCourse();
			const assignment = createMockAssignment({ courseId: course.id });

			mockPrismaService.course.findUnique.mockResolvedValue(course);
			mockPrismaService.assignment.create.mockResolvedValue(assignment);

			const actor = createMockUser({ role: "admin" });

			const result = await service.createAssignment(
				course.id,
				createAssignmentDto,
				actor,
			);

			expect(result).toEqual(assignment);
		});

		it("should create assignment for TA enrolled in course", async () => {
			const course = createMockCourse();
			const assignment = createMockAssignment({ courseId: course.id });

			mockPrismaService.course.findUnique.mockResolvedValue(course);
			mockPrismaService.assignment.create.mockResolvedValue(assignment);
			mockPrismaService.enrollment.findFirst.mockResolvedValue({});

			const actor = createMockUser({ role: "ta" });

			const result = await service.createAssignment(
				course.id,
				createAssignmentDto,
				actor,
			);

			expect(result).toEqual(assignment);
		});

		it("should throw ForbiddenException when TA is not enrolled", async () => {
			const course = createMockCourse();

			mockPrismaService.course.findUnique.mockResolvedValue(course);
			mockPrismaService.enrollment.findFirst.mockResolvedValue(null);

			const actor = createMockUser({ role: "ta" });

			await expect(
				service.createAssignment(course.id, createAssignmentDto, actor),
			).rejects.toThrow(ForbiddenException);
		});

		it("should trim title and handle default venue", async () => {
			const course = createMockCourse({ ownerId: "instructor-id" });
			const assignment = createMockAssignment();

			mockPrismaService.course.findUnique.mockResolvedValue(course);
			mockPrismaService.assignment.create.mockResolvedValue(assignment);

			const actor = createMockUser({
				role: "instructor",
				id: "instructor-id",
			});
			const dto = {
				...createAssignmentDto,
				title: "  Test Assignment  ",
				default_venue: "  Room 101  ",
			};

			await service.createAssignment(course.id, dto, actor);

			expect(mockPrismaService.assignment.create).toHaveBeenCalledWith({
				data: expect.objectContaining({
					title: "Test Assignment",
					defaultVenue: "Room 101",
				}),
			});
		});

		it("should use default values for optional fields", async () => {
			const course = createMockCourse({ ownerId: "instructor-id" });

			mockPrismaService.course.findUnique.mockResolvedValue(course);
			mockPrismaService.assignment.create.mockResolvedValue(
				createMockAssignment(),
			);

			const actor = createMockUser({
				role: "instructor",
				id: "instructor-id",
			});
			const dto = {
				title: "Test Assignment",
				demo_window_start: new Date(Date.now() + 86400000),
				demo_window_end: new Date(Date.now() + 172800000),
				slot_duration_min: 30,
				slot_capacity: 1,
				freeze_before_min: 60,
				max_cancellations: 2,
			};

			await service.createAssignment(course.id, dto, actor);

			expect(mockPrismaService.assignment.create).toHaveBeenCalledWith({
				data: expect.objectContaining({
					isPublished: false,
					defaultVenue: null,
				}),
			});
		});
	});
});
