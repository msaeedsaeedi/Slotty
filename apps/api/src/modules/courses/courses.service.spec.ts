import { Test, TestingModule } from "@nestjs/testing";
import { UserRole } from "@prisma/client";
import {
	createMockCourse,
	createMockEnrollment,
	createMockUser,
} from "@test/utils/factories";
import { PrismaService } from "prisma/prisma.service";
import {
	BadRequestException,
	ConflictException,
	NotFoundException,
} from "@/common/exceptions/business.exception";
import { isUniqueViolation } from "@/common/prisma.helpers";
import { AuditService } from "@/modules/audit/audit.service";
import { attempt } from "@/utils/attempt.util";
import { CoursesService } from "./courses.service";
import { CreateCourseDto } from "./dto/create-course.dto";
import { CreateEnrollmentDto } from "./dto/create-enrollment.dto";

jest.mock("@/common/prisma.helpers");
jest.mock("@/utils/attempt.util");

describe("CoursesService", () => {
	let service: CoursesService;
	let mockPrisma: any;
	let mockAuditService: any;

	const mockOwner = createMockUser({
		id: "owner-id",
		role: UserRole.instructor,
	});

	beforeEach(async () => {
		// Create a mock that handles both tagged template literals and function calls
		const createQueryRawMock = () => {
			const fn = jest.fn().mockResolvedValue([]);
			// Make it work as tagged template literal
			fn.toString = () => "function";
			return fn;
		};

		const queryRawMock = createQueryRawMock();

		mockPrisma = {
			user: {
				findUnique: jest.fn(),
				findMany: jest.fn(),
				create: jest.fn(),
			},
			course: {
				create: jest.fn(),
				findMany: jest.fn(),
				findUnique: jest.fn(),
			},
			enrollment: {
				findMany: jest.fn(),
				findUnique: jest.fn(),
				create: jest.fn(),
			},
			$queryRaw: queryRawMock,
		};

		mockAuditService = {
			append: jest.fn().mockResolvedValue(undefined),
		};

		(attempt as jest.Mock).mockImplementation((promise) =>
			promise.then(
				(data: any) => [null, data],
				(err: any) => [err, null],
			),
		);

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				CoursesService,
				{ provide: PrismaService, useValue: mockPrisma },
				{ provide: AuditService, useValue: mockAuditService },
			],
		}).compile();

		service = module.get<CoursesService>(CoursesService);

		jest.clearAllMocks();
	});

	describe("createCourse", () => {
		const dto: CreateCourseDto = {
			code: "CS101",
			title: "Intro to CS",
			term: "Fall 2024",
			owner_id: "owner-id",
		};

		it("should throw NotFoundException when owner not found", async () => {
			mockPrisma.user.findUnique.mockResolvedValue(null);

			await expect(service.createCourse(dto)).rejects.toThrow(
				NotFoundException,
			);
		});

		it("should throw BadRequestException when owner is not instructor", async () => {
			const nonInstructor = createMockUser({
				id: "owner-id",
				role: UserRole.student,
			});
			mockPrisma.user.findUnique.mockResolvedValue(nonInstructor);

			await expect(service.createCourse(dto)).rejects.toThrow(
				BadRequestException,
			);
		});

		it("should throw ConflictException when course already exists", async () => {
			mockPrisma.user.findUnique.mockResolvedValue(mockOwner);
			(attempt as jest.Mock).mockResolvedValueOnce([{ code: "P2002" }, null]);
			(isUniqueViolation as jest.Mock).mockReturnValue(true);

			await expect(service.createCourse(dto)).rejects.toThrow(
				ConflictException,
			);
		});

		it("should create course successfully", async () => {
			const course = createMockCourse({ code: "CS101" });
			mockPrisma.user.findUnique.mockResolvedValue(mockOwner);
			(attempt as jest.Mock).mockResolvedValueOnce([null, course]);

			const result = await service.createCourse(dto);

			expect(result).toEqual(course);
		});
	});

	describe("listCoursesForUser", () => {
		it("should return all courses for admin", async () => {
			const courses = [createMockCourse(), createMockCourse()];
			mockPrisma.course.findMany.mockResolvedValue(courses);

			const admin = createMockUser({ role: UserRole.admin });
			const result = await service.listCoursesForUser(admin);

			expect(result).toEqual(courses);
		});

		it("should return instructor courses for instructor", async () => {
			const courses = [createMockCourse({ ownerId: "instructor-id" })];
			mockPrisma.course.findMany.mockResolvedValue(courses);

			const instructor = createMockUser({
				id: "instructor-id",
				role: UserRole.instructor,
			});
			const result = await service.listCoursesForUser(instructor);

			expect(result).toEqual(courses);
		});

		it("should return enrolled courses for student", async () => {
			const enrollments = [{ courseId: "course-1" }, { courseId: "course-2" }];
			mockPrisma.enrollment.findMany.mockResolvedValue(enrollments);

			const courses = [
				createMockCourse({ id: "course-1" }),
				createMockCourse({ id: "course-2" }),
			];
			mockPrisma.course.findMany.mockResolvedValue(courses);

			const student = createMockUser({
				id: "student-id",
				role: UserRole.student,
			});
			const result = await service.listCoursesForUser(student);

			expect(result).toEqual(courses);
		});
	});

	describe("getCourseForUser", () => {
		const course = createMockCourse({ ownerId: "instructor-id" });

		it("should return course for admin", async () => {
			mockPrisma.course.findUnique.mockResolvedValue(course);

			const admin = createMockUser({ role: UserRole.admin });
			const result = await service.getCourseForUser(course.id, admin);

			expect(result).toEqual(course);
		});

		it("should return course for owner instructor", async () => {
			mockPrisma.course.findUnique.mockResolvedValue(course);

			const instructor = createMockUser({
				id: "instructor-id",
				role: UserRole.instructor,
			});
			const result = await service.getCourseForUser(course.id, instructor);

			expect(result).toEqual(course);
		});
	});

	describe("createEnrollment", () => {
		const course = createMockCourse();
		const user = createMockUser({ role: UserRole.student });
		const dto: CreateEnrollmentDto = {
			user_id: "user-id",
			role_in_course: "student",
		};

		beforeEach(() => {
			mockPrisma.course.findUnique.mockResolvedValue(course);
		});

		it("should throw NotFoundException when user not found", async () => {
			mockPrisma.user.findUnique.mockResolvedValue(null);

			await expect(service.createEnrollment(course.id, dto)).rejects.toThrow(
				NotFoundException,
			);
		});

		it("should create enrollment successfully", async () => {
			const enrollment = createMockEnrollment({
				courseId: course.id,
				userId: user.id,
			});
			mockPrisma.user.findUnique.mockResolvedValue(user);
			(attempt as jest.Mock).mockResolvedValueOnce([null, enrollment]);

			const result = await service.createEnrollment(course.id, dto);

			expect(result).toEqual(enrollment);
		});
	});
});
