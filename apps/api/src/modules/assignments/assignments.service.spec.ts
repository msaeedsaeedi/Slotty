import { Test, TestingModule } from "@nestjs/testing";
import { UserRole } from "@repo/database";
import { createMockCourse, createMockUser } from "@test/utils/factories";
import { PrismaService } from "prisma/prisma.service";
import {
	BadRequestException,
	ForbiddenException,
	NotFoundException,
} from "@/common/exceptions/business.exception";
import { AuditService } from "@/modules/audit/audit.service";
import { AssignmentsService } from "./assignments.service";
import { CreateAssignmentDto } from "./dto/create-assignment.dto";

describe("AssignmentsService", () => {
	let service: AssignmentsService;
	let mockPrisma: any;
	let mockAuditService: jest.Mocked<AuditService>;

	const mockCourse = createMockCourse({
		id: "course-id",
		ownerId: "instructor-id",
	});

	beforeEach(async () => {
		mockPrisma = {
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

		mockAuditService = {
			append: jest.fn().mockResolvedValue(undefined),
		} as any;

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				AssignmentsService,
				{ provide: PrismaService, useValue: mockPrisma },
				{ provide: AuditService, useValue: mockAuditService },
			],
		}).compile();

		service = module.get<AssignmentsService>(AssignmentsService);

		jest.clearAllMocks();
	});

	describe("createAssignment", () => {
		const dto: CreateAssignmentDto = {
			title: "Project Demo",
			demo_window_start: new Date(Date.now() + 86400000),
			demo_window_end: new Date(Date.now() + 172800000),
			slot_duration_min: 30,
			slot_capacity: 1,
			freeze_before_min: 60,
			max_cancellations: 2,
			is_published: false,
		};

		it("should throw NotFoundException when course not found", async () => {
			mockPrisma.course.findUnique.mockResolvedValue(null);

			const actor = createMockUser({ role: UserRole.instructor });
			await expect(
				service.createAssignment(mockCourse.id, dto, actor),
			).rejects.toThrow(NotFoundException);
		});

		it("should throw ForbiddenException when instructor not course owner", async () => {
			mockPrisma.course.findUnique.mockResolvedValue(mockCourse);

			const actor = createMockUser({
				id: "other-instructor",
				role: UserRole.instructor,
			});
			await expect(
				service.createAssignment(mockCourse.id, dto, actor),
			).rejects.toThrow(ForbiddenException);
		});

		it("should throw BadRequestException when demo window end before start", async () => {
			mockPrisma.course.findUnique.mockResolvedValue(mockCourse);

			const actor = createMockUser({
				id: "instructor-id",
				role: UserRole.instructor,
			});
			const invalidDto = {
				...dto,
				demo_window_end: new Date(Date.now() + 100000), // Before start
			};
			await expect(
				service.createAssignment(mockCourse.id, invalidDto, actor),
			).rejects.toThrow(BadRequestException);
		});

		it("should throw ForbiddenException when student tries to create", async () => {
			mockPrisma.course.findUnique.mockResolvedValue(mockCourse);

			const actor = createMockUser({
				id: "student-id",
				role: UserRole.student,
			});
			await expect(
				service.createAssignment(mockCourse.id, dto, actor),
			).rejects.toThrow(ForbiddenException);
		});

		it("should throw ForbiddenException when TA not enrolled", async () => {
			mockPrisma.course.findUnique.mockResolvedValue(mockCourse);
			mockPrisma.enrollment.findFirst.mockResolvedValue(null);

			const actor = createMockUser({
				id: "ta-id",
				role: UserRole.ta,
			});
			await expect(
				service.createAssignment(mockCourse.id, dto, actor),
			).rejects.toThrow(ForbiddenException);
		});

		it("should create assignment successfully for instructor", async () => {
			mockPrisma.course.findUnique.mockResolvedValue(mockCourse);
			const created = {
				id: "assignment-id",
				title: dto.title,
				courseId: mockCourse.id,
				demoWindowStart: new Date(),
				demoWindowEnd: new Date(),
			};
			mockPrisma.assignment.create.mockResolvedValue(created);

			const actor = createMockUser({
				id: "instructor-id",
				role: UserRole.instructor,
			});
			const result = await service.createAssignment(mockCourse.id, dto, actor);

			expect(result).toEqual(created);
			expect(mockPrisma.assignment.create).toHaveBeenCalled();
			expect(mockAuditService.append).toHaveBeenCalled();
		});

		it("should create assignment successfully for enrolled TA", async () => {
			mockPrisma.course.findUnique.mockResolvedValue(mockCourse);
			mockPrisma.enrollment.findFirst.mockResolvedValue({});
			const created = {
				id: "assignment-id",
				title: dto.title,
				demoWindowStart: new Date(),
				demoWindowEnd: new Date(),
			};
			mockPrisma.assignment.create.mockResolvedValue(created);

			const actor = createMockUser({
				id: "ta-id",
				role: UserRole.ta,
			});
			const result = await service.createAssignment(mockCourse.id, dto, actor);

			expect(result).toEqual(created);
		});

		it("should allow admin to create assignment", async () => {
			mockPrisma.course.findUnique.mockResolvedValue(mockCourse);
			const created = {
				id: "assignment-id",
				demoWindowStart: new Date(),
				demoWindowEnd: new Date(),
			};
			mockPrisma.assignment.create.mockResolvedValue(created);

			const actor = createMockUser({ role: UserRole.admin });
			const result = await service.createAssignment(mockCourse.id, dto, actor);

			expect(result).toEqual(created);
		});
	});
});
