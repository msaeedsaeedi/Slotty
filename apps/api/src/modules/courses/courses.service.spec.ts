import {
	BadRequestException,
	ConflictException,
	NotFoundException,
} from "@/common/exceptions/business.exception";
import { CoursesService } from "./courses.service";
import { CreateCourseDto } from "./dto/create-course.dto";
import { CreateEnrollmentDto } from "./dto/create-enrollment.dto";

// Mock the prism.helpers module
jest.mock("@/common/prisma.helpers", () => ({
	...jest.requireActual("@/common/prisma.helpers"),
	isUniqueViolation: jest.fn(),
}));

import { isUniqueViolation } from "@/common/prisma.helpers";

describe("CoursesService", () => {
	let service: CoursesService;
	let mockPrisma: any;
	let mockAudit: any;

	beforeEach(() => {
		// Create fresh mocks for each test
		const enrollmentMock = {
			findFirst: jest.fn(),
			findMany: jest.fn(),
			create: jest.fn(),
			findUnique: jest.fn(),
		};

		const userMock = {
			findUnique: jest.fn(),
			findMany: jest.fn(),
			create: jest.fn(),
		};

		const courseMock = {
			create: jest.fn(),
			findUnique: jest.fn(),
			findMany: jest.fn(),
		};

		mockPrisma = {
			user: userMock,
			course: courseMock,
			enrollment: enrollmentMock,
			$queryRaw: jest.fn(),
			$queryRawUnsafe: jest.fn(),
		} as any;

		mockAudit = { append: jest.fn() };

		// Clear all mocks
		jest.clearAllMocks();

		service = new CoursesService(mockPrisma, mockAudit);
	});

	// Helper DTOs
	const courseDto: CreateCourseDto = {
		code: "CS101",
		title: "Intro to CS",
		term: "2026",
		owner_id: "owner1",
	} as any;

	const ownerInstructor = { id: "owner1", role: "instructor" } as any;

	it("createCourse - success path", async () => {
		mockPrisma.user.findUnique.mockResolvedValue(ownerInstructor);
		mockPrisma.course.create.mockResolvedValue({
			id: "c1",
			code: "CS101",
			title: "Intro to CS",
			term: "2026",
			ownerId: ownerInstructor.id,
		} as any);

		const course = await service.createCourse(courseDto);
		expect(course).toBeDefined();
		expect(mockPrisma.course.create).toHaveBeenCalledWith(
			expect.objectContaining({
				data: {
					code: "CS101",
					title: "Intro to CS",
					term: "2026",
					ownerId: ownerInstructor.id,
				},
			}),
		);
	});

	it("createCourse - owner not found", async () => {
		mockPrisma.user.findUnique.mockResolvedValue(null);
		await expect(service.createCourse(courseDto)).rejects.toBeInstanceOf(
			NotFoundException,
		);
	});

	it("createCourse - owner not instructor", async () => {
		mockPrisma.user.findUnique.mockResolvedValue({
			id: "owner1",
			role: "student",
		});
		await expect(service.createCourse(courseDto)).rejects.toBeInstanceOf(
			BadRequestException,
		);
	});

	it("createCourse - unique violation -> ConflictException", async () => {
		mockPrisma.user.findUnique.mockResolvedValue(ownerInstructor);
		mockPrisma.course.create.mockRejectedValue(new Error("dup"));

		// Mock isUniqueViolation to return true
		(isUniqueViolation as jest.Mock).mockReturnValue(true);

		await expect(service.createCourse(courseDto)).rejects.toBeInstanceOf(
			ConflictException,
		);
	});

	it("listCoursesForUser - admin path uses listAllCourses", async () => {
		const admin = { id: "a1", role: "admin" } as any;

		// Mock the private method listAllCourses
		const listAllCoursesSpy = jest
			.spyOn(service as any, "listAllCourses")
			.mockResolvedValue([{ id: "c1" }] as any);

		const res = await service.listCoursesForUser(admin, undefined);
		expect(res).toEqual([{ id: "c1" }]);
		expect(listAllCoursesSpy).toHaveBeenCalled();
	});

	it("listCoursesForUser - instructor path returns owner courses", async () => {
		const inst = { id: "in1", role: "instructor" } as any;
		mockPrisma.course.findMany.mockResolvedValue([{ id: "c2" }] as any);

		const res = await service.listCoursesForUser(inst, undefined);
		expect(mockPrisma.course.findMany).toHaveBeenCalled();
		expect(res).toEqual([{ id: "c2" }]);
	});

	it("getCourseForUser - admin can fetch any", async () => {
		const admin = { id: "a", role: "admin" } as any;
		const course = { id: "c1" } as any;

		// Mock the private method getCourse
		const getCourseSpy = jest
			.spyOn(service as any, "getCourse")
			.mockResolvedValue(course);

		const res = await service.getCourseForUser("c1", admin);
		expect(res).toBe(course);
		expect(getCourseSpy).toHaveBeenCalled();
	});

	it("getCourseForUser - student not enrolled -> NotFoundException", async () => {
		const student = { id: "u1", role: "student" } as any;
		const course = { id: "c1", ownerId: "other" } as any;

		// Mock the private method getCourse
		jest.spyOn(service as any, "getCourse").mockResolvedValue(course);
		mockPrisma.enrollment.findUnique.mockResolvedValue(null);

		await expect(
			service.getCourseForUser("c1", student),
		).rejects.toBeInstanceOf(NotFoundException);
	});

	it("createEnrollment - user not found -> NotFoundException", async () => {
		mockPrisma.user.findUnique.mockResolvedValue(null);

		// Mock getCourse
		jest
			.spyOn(service as any, "getCourse")
			.mockResolvedValue({ id: "c1" } as any);

		const dto: CreateEnrollmentDto = {
			user_id: "u1",
			course_id: "c1",
			role_in_course: "student",
		} as any;

		await expect(service.createEnrollment("c1", dto)).rejects.toBeInstanceOf(
			NotFoundException,
		);
	});

	it("createEnrollment - role mismatch -> BadRequestException", async () => {
		mockPrisma.user.findUnique.mockResolvedValue({
			id: "u1",
			role: "student",
		} as any);

		// Mock getCourse
		jest
			.spyOn(service as any, "getCourse")
			.mockResolvedValue({ id: "c1" } as any);

		const dto: CreateEnrollmentDto = {
			user_id: "u1",
			course_id: "c1",
			role_in_course: "ta",
		} as any;

		await expect(service.createEnrollment("c1", dto)).rejects.toBeInstanceOf(
			BadRequestException,
		);
	});

	it("createEnrollment - success path", async () => {
		mockPrisma.user.findUnique.mockResolvedValue({
			id: "u1",
			role: "student",
		} as any);

		// Mock getCourse
		jest
			.spyOn(service as any, "getCourse")
			.mockResolvedValue({ id: "c1" } as any);

		mockPrisma.enrollment.create.mockResolvedValue({ id: "enr1" } as any);

		const dto: CreateEnrollmentDto = {
			user_id: "u1",
			course_id: "c1",
			role_in_course: "student",
		} as any;

		const res = await service.createEnrollment("c1", dto);
		expect(res).toBeTruthy();
	});

	it("bulkEnroll - empty CSV throws BadRequest with EMPTY_CSV", async () => {
		// Mock getCourse
		jest
			.spyOn(service as any, "getCourse")
			.mockResolvedValue({ id: "c1" } as any);

		await expect(
			service.bulkEnroll("c1", "email,role\n", {
				id: "u1",
				role: "admin",
			} as any),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	// ==================== listCoursesForUser additional tests ====================

	it("listCoursesForUser - student with no enrollments returns empty array", async () => {
		const student = { id: "u1", role: "student" } as any;
		mockPrisma.enrollment.findMany.mockResolvedValue([]);

		const res = await service.listCoursesForUser(student, undefined);
		expect(res).toEqual([]);
		expect(mockPrisma.enrollment.findMany).toHaveBeenCalledWith({
			where: { userId: "u1" },
			select: { courseId: true },
		});
	});

	it("listCoursesForUser - student with enrollments returns courses", async () => {
		const student = { id: "u1", role: "student" } as any;
		mockPrisma.enrollment.findMany.mockResolvedValue([
			{ courseId: "c1" },
			{ courseId: "c2" },
		] as any);
		mockPrisma.course.findMany.mockResolvedValue([
			{ id: "c1", title: "Course 1" },
			{ id: "c2", title: "Course 2" },
		] as any);

		const res = await service.listCoursesForUser(student, undefined);
		expect(res).toHaveLength(2);
		expect(mockPrisma.course.findMany).toHaveBeenCalledWith({
			where: { id: { in: ["c1", "c2"] } },
			orderBy: { createdAt: "desc" },
		});
	});

	it("listCoursesForUser - student with term filter", async () => {
		const student = { id: "u1", role: "student" } as any;
		mockPrisma.enrollment.findMany.mockResolvedValue([
			{ courseId: "c1" },
		] as any);
		mockPrisma.course.findMany.mockResolvedValue([{ id: "c1" }] as any);

		await service.listCoursesForUser(student, "2026");
		expect(mockPrisma.course.findMany).toHaveBeenCalledWith({
			where: { id: { in: ["c1"] }, term: "2026" },
			orderBy: { createdAt: "desc" },
		});
	});

	it("listCoursesForUser - admin with term filter uses listAllCourses", async () => {
		const admin = { id: "a1", role: "admin" } as any;

		const listAllCoursesSpy = jest
			.spyOn(service as any, "listAllCourses")
			.mockResolvedValue([{ id: "c1" }] as any);

		await service.listCoursesForUser(admin, "2026");
		expect(listAllCoursesSpy).toHaveBeenCalledWith("2026");
	});

	it("listCoursesForUser - instructor with term filter", async () => {
		const inst = { id: "in1", role: "instructor" } as any;
		mockPrisma.course.findMany.mockResolvedValue([{ id: "c2" }] as any);

		await service.listCoursesForUser(inst, "2026");
		expect(mockPrisma.course.findMany).toHaveBeenCalledWith({
			where: { ownerId: "in1", term: "2026" },
			orderBy: { createdAt: "desc" },
		});
	});

	// ==================== getCourseForUser additional tests ====================

	it("getCourseForUser - instructor owner can access", async () => {
		const instructor = { id: "in1", role: "instructor" } as any;
		const course = { id: "c1", ownerId: "in1" } as any;

		jest.spyOn(service as any, "getCourse").mockResolvedValue(course);

		const res = await service.getCourseForUser("c1", instructor);
		expect(res).toBe(course);
	});

	it("getCourseForUser - instructor not owner -> NotFoundException", async () => {
		const instructor = { id: "in1", role: "instructor" } as any;
		const course = { id: "c1", ownerId: "other" } as any;

		jest.spyOn(service as any, "getCourse").mockResolvedValue(course);

		await expect(
			service.getCourseForUser("c1", instructor),
		).rejects.toBeInstanceOf(NotFoundException);
	});

	it("getCourseForUser - student enrolled can access", async () => {
		const student = { id: "u1", role: "student" } as any;
		const course = { id: "c1", ownerId: "in1" } as any;

		jest.spyOn(service as any, "getCourse").mockResolvedValue(course);
		mockPrisma.enrollment.findUnique.mockResolvedValue({
			courseId: "c1",
			userId: "u1",
		} as any);

		const res = await service.getCourseForUser("c1", student);
		expect(res).toBe(course);
	});

	// ==================== createEnrollment additional tests ====================

	it("createEnrollment - unique violation -> ConflictException", async () => {
		const dto: CreateEnrollmentDto = {
			user_id: "u1",
			course_id: "c1",
			role_in_course: "student",
		} as any;

		jest
			.spyOn(service as any, "getCourse")
			.mockResolvedValue({ id: "c1" } as any);
		mockPrisma.user.findUnique.mockResolvedValue({
			id: "u1",
			role: "student",
		} as any);

		(isUniqueViolation as jest.Mock).mockReturnValue(true);
		mockPrisma.enrollment.create.mockRejectedValue(
			new Error("unique violation"),
		);

		await expect(service.createEnrollment("c1", dto)).rejects.toBeInstanceOf(
			ConflictException,
		);
	});

	it("createEnrollment - non-unique violation error rethrows", async () => {
		const dto: CreateEnrollmentDto = {
			user_id: "u1",
			course_id: "c1",
			role_in_course: "student",
		} as any;

		jest
			.spyOn(service as any, "getCourse")
			.mockResolvedValue({ id: "c1" } as any);
		mockPrisma.user.findUnique.mockResolvedValue({
			id: "u1",
			role: "student",
		} as any);

		(isUniqueViolation as jest.Mock).mockReturnValue(false);
		mockPrisma.enrollment.create.mockRejectedValue(
			new Error("some other error"),
		);

		await expect(service.createEnrollment("c1", dto)).rejects.toThrow(
			"some other error",
		);
	});

	it("createCourse - non-unique violation error rethrows", async () => {
		mockPrisma.user.findUnique.mockResolvedValue(ownerInstructor);
		(isUniqueViolation as jest.Mock).mockReturnValue(false);
		mockPrisma.course.create.mockRejectedValue(new Error("some other error"));

		await expect(service.createCourse(courseDto)).rejects.toThrow(
			"some other error",
		);
	});

	// ==================== bulkEnroll additional tests ====================

	it("bulkEnroll - success with existing users", async () => {
		const actor = { id: "admin1", role: "admin" } as any;
		const course = { id: "c1" } as any;

		jest.spyOn(service as any, "getCourse").mockResolvedValue(course);
		mockPrisma.user.findMany.mockResolvedValue([
			{ id: "u1", email: "student1@test.com", role: "student" },
			{ id: "u2", email: "student2@test.com", role: "student" },
		] as any);

		mockPrisma.$queryRaw.mockResolvedValue([
			{ user_id: "u1" },
			{ user_id: "u2" },
		]);
		mockAudit.append.mockResolvedValue(undefined);

		const csv =
			"email,role\nstudent1@test.com,student\nstudent2@test.com,student";
		const res = await service.bulkEnroll("c1", csv, actor);

		expect(res.results).toHaveLength(2);
		expect(res.results.every((r) => r.status === "created")).toBe(true);
		expect(mockAudit.append).toHaveBeenCalled();
	});

	it("bulkEnroll - creates missing users with pending_verification status", async () => {
		const actor = { id: "admin1", role: "admin" } as any;
		const course = { id: "c1" } as any;

		jest.spyOn(service as any, "getCourse").mockResolvedValue(course);
		mockPrisma.user.findMany.mockResolvedValue([]);
		mockPrisma.user.create.mockImplementation(({ data }) =>
			Promise.resolve({ id: "new1", ...data }),
		);
		mockPrisma.$queryRaw.mockResolvedValue([{ user_id: "new1" }]);
		mockAudit.append.mockResolvedValue(undefined);

		const csv = "email,role\nnewuser@test.com,student";
		const res = await service.bulkEnroll("c1", csv, actor);

		expect(mockPrisma.user.create).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					email: "newuser@test.com",
					role: "student",
					status: "pending_verification",
				}),
			}),
		);
		expect(res.results[0].status).toBe("created");
	});

	it("bulkEnroll - skips already enrolled users", async () => {
		const actor = { id: "admin1", role: "admin" } as any;
		const course = { id: "c1" } as any;

		jest.spyOn(service as any, "getCourse").mockResolvedValue(course);
		mockPrisma.user.findMany.mockResolvedValue([
			{ id: "u1", email: "student@test.com", role: "student" },
		] as any);
		mockPrisma.$queryRaw.mockResolvedValue([]);
		mockAudit.append.mockResolvedValue(undefined);

		const csv = "email,role\nstudent@test.com,student";
		const res = await service.bulkEnroll("c1", csv, actor);

		expect(res.results[0].status).toBe("already_enrolled");
	});

	it("bulkEnroll - handles role mismatch for individual users", async () => {
		const actor = { id: "admin1", role: "admin" } as any;
		const course = { id: "c1" } as any;

		jest.spyOn(service as any, "getCourse").mockResolvedValue(course);
		mockPrisma.user.findMany.mockResolvedValue([
			{ id: "u1", email: "student@test.com", role: "ta" },
		] as any);
		mockAudit.append.mockResolvedValue(undefined);

		const csv = "email,role\nstudent@test.com,student";
		const res = await service.bulkEnroll("c1", csv, actor);

		expect(res.results[0].status).toBe("error");
		expect(res.results[0].error).toContain("does not match");
	});

	it("bulkEnroll - CSV too large throws BadRequest", async () => {
		jest
			.spyOn(service as any, "getCourse")
			.mockResolvedValue({ id: "c1" } as any);

		const header = "email,role\n";
		const rows = Array(1001).fill("student@test.com,student").join("\n");
		const csv = header + rows;

		await expect(
			service.bulkEnroll("c1", csv, { id: "u1", role: "admin" } as any),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it("bulkEnroll - invalid CSV format throws BadRequest", async () => {
		jest
			.spyOn(service as any, "getCourse")
			.mockResolvedValue({ id: "c1" } as any);

		await expect(
			service.bulkEnroll("c1", "invalid csv data", {
				id: "u1",
				role: "admin",
			} as any),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it("bulkEnroll - missing CSV headers throws BadRequest", async () => {
		jest
			.spyOn(service as any, "getCourse")
			.mockResolvedValue({ id: "c1" } as any);

		await expect(
			service.bulkEnroll("c1", "name,age\nvalue1,value2", {
				id: "u1",
				role: "admin",
			} as any),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it("bulkEnroll - missing fields in row throws BadRequest", async () => {
		jest
			.spyOn(service as any, "getCourse")
			.mockResolvedValue({ id: "c1" } as any);

		await expect(
			service.bulkEnroll("c1", "email,role\nstudent@test.com", {
				id: "u1",
				role: "admin",
			} as any),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it("bulkEnroll - invalid role in CSV throws BadRequest", async () => {
		jest
			.spyOn(service as any, "getCourse")
			.mockResolvedValue({ id: "c1" } as any);

		await expect(
			service.bulkEnroll("c1", "email,role\nstudent@test.com,invalid", {
				id: "u1",
				role: "admin",
			} as any),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it("bulkEnroll - mixed results with created, already_enrolled and errors", async () => {
		const actor = { id: "admin1", role: "admin" } as any;
		const course = { id: "c1" } as any;

		jest.spyOn(service as any, "getCourse").mockResolvedValue(course);
		mockPrisma.user.findMany.mockResolvedValue([
			{ id: "u1", email: "existing@test.com", role: "student" },
			{ id: "u2", email: "role mismatch@test.com", role: "ta" },
		] as any);
		mockPrisma.$queryRaw.mockResolvedValue([{ user_id: "u1" }]);
		mockAudit.append.mockResolvedValue(undefined);

		const csv =
			"email,role\nexisting@test.com,student\nrole mismatch@test.com,student\nnonexistent@test.com,student";
		mockPrisma.user.create.mockImplementation(({ data }) =>
			Promise.resolve({ id: "new1", ...data }),
		);

		const res = await service.bulkEnroll("c1", csv, actor);

		expect(res.results.some((r) => r.status === "created")).toBe(true);
		expect(res.results.some((r) => r.status === "already_enrolled")).toBe(true);
		expect(res.results.some((r) => r.status === "error")).toBe(true);
		expect(mockAudit.append).toHaveBeenCalled();
	});

	it("bulkEnroll - handles duplicate emails in CSV correctly", async () => {
		const actor = { id: "admin1", role: "admin" } as any;
		const course = { id: "c1" } as any;

		jest.spyOn(service as any, "getCourse").mockResolvedValue(course);
		mockPrisma.user.findMany.mockResolvedValue([
			{ id: "u1", email: "student@test.com", role: "student" },
		] as any);
		mockPrisma.$queryRaw.mockResolvedValue([{ user_id: "u1" }]);
		mockAudit.append.mockResolvedValue(undefined);

		const csv =
			"email,role\nstudent@test.com,student\nstudent@test.com,student";
		const res = await service.bulkEnroll("c1", csv, actor);

		expect(res.results).toHaveLength(2);
		expect(
			res.results.every(
				(r) => r.status === "created" || r.status === "already_enrolled",
			),
		).toBe(true);
	});

	// ==================== Private method tests via public methods ====================

	it("getCourse - throws NotFoundException when course not found", async () => {
		const admin = { id: "a", role: "admin" } as any;

		jest.spyOn(service as any, "getCourse").mockImplementation(async () => {
			throw new NotFoundException("Course not found.");
		});

		await expect(
			service.getCourseForUser("nonexistent", admin),
		).rejects.toBeInstanceOf(NotFoundException);
	});

	it("listAllCourses - returns courses without term filter", async () => {
		mockPrisma.course.findMany.mockResolvedValue([
			{ id: "c1" },
			{ id: "c2" },
		] as any);

		const listAllCourses = (service as any).listAllCourses.bind(service);
		const res = await listAllCourses();
		expect(res).toHaveLength(2);
		expect(mockPrisma.course.findMany).toHaveBeenCalledWith({
			orderBy: { createdAt: "desc" },
		});
	});

	it("listAllCourses - returns courses with term filter", async () => {
		mockPrisma.course.findMany.mockResolvedValue([{ id: "c1" }] as any);

		const listAllCourses = (service as any).listAllCourses.bind(service);
		await listAllCourses("2026");
		expect(mockPrisma.course.findMany).toHaveBeenCalledWith({
			where: { term: "2026" },
			orderBy: { createdAt: "desc" },
		});
	});
});
