import { Test, TestingModule } from "@nestjs/testing";
import { UserRole } from "@prisma/client";
import { createMockCourse, createMockUser } from "@test/utils/factories";
import { PrismaService } from "prisma/prisma.service";
import {
	BadRequestException,
	NotFoundException,
} from "@/common/exceptions/business.exception";
import { AuditService } from "@/modules/audit/audit.service";
import { CoursesService } from "./courses.service";

describe("CoursesService", () => {
	let service: CoursesService;
	// biome-ignore lint/correctness/noUnusedVariables: <False Positive - used>
	let prisma: jest.Mocked<PrismaService>;
	// biome-ignore lint/correctness/noUnusedVariables: <False Positive - used>
	let auditService: jest.Mocked<AuditService>;

	const mockPrismaService = {
		course: {
			findUnique: jest.fn(),
			findMany: jest.fn(),
			create: jest.fn(),
		},
		user: {
			findUnique: jest.fn(),
			findMany: jest.fn(),
			create: jest.fn(),
		},
		enrollment: {
			findMany: jest.fn(),
			findUnique: jest.fn(),
			create: jest.fn(),
		},
		$queryRaw: jest.fn(),
		$queryRawUnsafe: jest.fn(),
	};

	const mockAuditService = {
		append: jest.fn().mockResolvedValue(undefined),
	};

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				CoursesService,
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

		service = module.get<CoursesService>(CoursesService);
		prisma = module.get(PrismaService) as jest.Mocked<PrismaService>;
		auditService = module.get(AuditService) as jest.Mocked<AuditService>;

		jest.clearAllMocks();
	});

	describe("createCourse", () => {
		it("should throw NotFoundException when owner not found", async () => {
			mockPrismaService.user.findUnique.mockResolvedValue(null);

			const dto = {
				owner_id: "non-existent",
				code: "CS101",
				title: "Test Course",
				term: "Fall 2024",
			};

			await expect(service.createCourse(dto)).rejects.toThrow(
				NotFoundException,
			);
		});

		it("should throw BadRequestException when owner is not instructor", async () => {
			const owner = createMockUser({ role: UserRole.student });
			mockPrismaService.user.findUnique.mockResolvedValue(owner);

			const dto = {
				owner_id: owner.id,
				code: "CS101",
				title: "Test Course",
				term: "Fall 2024",
			};

			await expect(service.createCourse(dto)).rejects.toThrow(
				BadRequestException,
			);
		});

		it("should create course successfully", async () => {
			const owner = createMockUser({ role: UserRole.instructor });
			const course = createMockCourse({ ownerId: owner.id });

			mockPrismaService.user.findUnique.mockResolvedValue(owner);
			mockPrismaService.course.create.mockResolvedValue(course);

			const dto = {
				owner_id: owner.id,
				code: course.code,
				title: course.title,
				term: course.term,
			};

			const result = await service.createCourse(dto);
			expect(result).toEqual(course);
		});
	});

	describe("listCoursesForUser", () => {
		it("should return all courses for admin", async () => {
			const admin = createMockUser({ role: UserRole.admin });
			const courses = [createMockCourse(), createMockCourse()];

			mockPrismaService.course.findMany.mockResolvedValue(courses);

			const result = await service.listCoursesForUser(admin);
			expect(result).toEqual(courses);
		});

		it("should return instructor courses for instructor", async () => {
			const instructor = createMockUser({
				role: UserRole.instructor,
				id: "instructor-id",
			});
			const courses = [createMockCourse({ ownerId: instructor.id })];

			mockPrismaService.course.findMany.mockResolvedValue(courses);

			const result = await service.listCoursesForUser(instructor);
			expect(result).toEqual(courses);
		});

		it("should return enrolled courses for student", async () => {
			const student = createMockUser({ role: UserRole.student });
			const enrollments = [{ courseId: "course-1" }, { courseId: "course-2" }];
			const courses = [createMockCourse({ id: "course-1" })];

			mockPrismaService.enrollment.findMany.mockResolvedValue(enrollments);
			mockPrismaService.course.findMany.mockResolvedValue(courses);

			const result = await service.listCoursesForUser(student);
			expect(result).toEqual(courses);
		});

		it("should return empty array when student has no enrollments", async () => {
			const student = createMockUser({ role: UserRole.student });

			mockPrismaService.enrollment.findMany.mockResolvedValue([]);

			const result = await service.listCoursesForUser(student);
			expect(result).toEqual([]);
		});
	});

	describe("bulkEnroll", () => {
		it("should throw BadRequestException for empty CSV", async () => {
			const course = createMockCourse();
			mockPrismaService.course.findUnique.mockResolvedValue(course);

			await expect(
				service.bulkEnroll(course.id, "", createMockUser()),
			).rejects.toThrow(BadRequestException);
		});

		it("should throw BadRequestException for CSV too large", async () => {
			const course = createMockCourse();
			mockPrismaService.course.findUnique.mockResolvedValue(course);

			const rows = Array(1001).fill("test@example.com,student").join("\n");
			const csvData = "email,role\n" + rows;

			await expect(
				service.bulkEnroll(course.id, csvData, createMockUser()),
			).rejects.toThrow(BadRequestException);
		});

		it("should parse CSV and enroll users", async () => {
			const course = createMockCourse();
			const csvData = "email,role\nstudent1@test.com,student\nta1@test.com,ta";

			mockPrismaService.course.findUnique.mockResolvedValue(course);
			mockPrismaService.user.findMany.mockResolvedValue([]);
			mockPrismaService.user.create
				.mockResolvedValueOnce({
					id: "user-1",
					email: "student1@test.com",
					role: UserRole.student,
				})
				.mockResolvedValueOnce({
					id: "user-2",
					email: "ta1@test.com",
					role: UserRole.ta,
				});

			// Mock the $queryRaw to return inserted user IDs
			// The service uses $queryRaw with $queryRawUnsafe inside a template literal
			mockPrismaService.$queryRaw.mockResolvedValue([
				{ user_id: "user-1" },
				{ user_id: "user-2" },
			]);

			const result = await service.bulkEnroll(
				course.id,
				csvData,
				createMockUser(),
			);

			expect(result.results).toHaveLength(2);
			expect(result.results[0]?.status).toBeDefined();
		});
	});

	describe("parseCsvRows", () => {
		it("should throw BadRequestException for missing headers", () => {
			const csvData = "name,age\nvalue1,value2";

			expect(() => service["parseCsvRows"](csvData)).toThrow(
				BadRequestException,
			);
		});

		it("should parse valid CSV correctly", () => {
			const csvData = "email,role\ntest@example.com,student\nadmin@test.com,ta";

			const result = service["parseCsvRows"](csvData);

			expect(result).toHaveLength(2);
			expect(result[0]).toEqual({
				email: "test@example.com",
				role_in_course: "student",
			});
		});

		it("should throw BadRequestException for invalid role", () => {
			const csvData = "email,role\ntest@example.com,invalid_role";

			expect(() => service["parseCsvRows"](csvData)).toThrow(
				BadRequestException,
			);
		});
	});
});
