import { Test, TestingModule } from "@nestjs/testing";
import { User } from "@prisma/client";
import { UnauthorizedException } from "@/common/exceptions/business.exception";
import { CoursesController } from "./courses.controller";
import { CoursesService } from "./courses.service";
import { CreateCourseDto } from "./dto/create-course.dto";
import { CreateEnrollmentDto } from "./dto/create-enrollment.dto";

jest.mock("./courses.service");

describe("CoursesController", () => {
	let controller: CoursesController;
	let mockCoursesService: any;

	const mockUser: User = {
		id: "user-id",
		email: "test@example.com",
		name: "Test User",
		role: "instructor",
		status: "active",
		googleId: null,
		rollNumber: null,
		deletedAt: null,
		createdAt: new Date(),
		updatedAt: new Date(),
	};

	beforeEach(async () => {
		mockCoursesService = {
			createCourse: jest.fn(),
			listCoursesForUser: jest.fn(),
			getCourseForUser: jest.fn(),
			createEnrollment: jest.fn(),
			bulkEnroll: jest.fn(),
		};

		const module: TestingModule = await Test.createTestingModule({
			controllers: [CoursesController],
			providers: [{ provide: CoursesService, useValue: mockCoursesService }],
		}).compile();

		controller = module.get<CoursesController>(CoursesController);

		jest.clearAllMocks();
	});

	describe("createCourse", () => {
		const dto: CreateCourseDto = {
			code: "CS101",
			title: "Intro to CS",
			term: "Fall 2024",
			owner_id: "instructor-id",
		};

		it("should create course successfully", async () => {
			const course = { id: "course-id", ...dto };
			mockCoursesService.createCourse.mockResolvedValue(course);

			const response = await controller.createCourse(dto);

			expect(response).toEqual({ course });
			expect(mockCoursesService.createCourse).toHaveBeenCalledWith(dto);
		});
	});

	describe("listCourses", () => {
		it("should throw UnauthorizedException when user not authenticated", async () => {
			await expect(
				controller.listCourses(undefined, { user: undefined } as any),
			).rejects.toThrow(UnauthorizedException);
		});

		it("should list courses without term filter", async () => {
			const courses = [{ id: "course-1" }, { id: "course-2" }];
			mockCoursesService.listCoursesForUser.mockResolvedValue(courses);

			const response = await controller.listCourses(undefined, {
				user: mockUser,
			} as any);

			expect(response).toEqual({
				courses,
				meta: { total: courses.length },
			});
		});

		it("should list courses with term filter", async () => {
			const courses = [{ id: "course-1" }];
			mockCoursesService.listCoursesForUser.mockResolvedValue(courses);

			await controller.listCourses("Fall 2024", {
				user: mockUser,
			} as any);

			expect(mockCoursesService.listCoursesForUser).toHaveBeenCalledWith(
				mockUser,
				"Fall 2024",
			);
		});
	});

	describe("getCourse", () => {
		it("should throw UnauthorizedException when user not authenticated", async () => {
			await expect(
				controller.getCourse("course-id", { user: undefined } as any),
			).rejects.toThrow(UnauthorizedException);
		});

		it("should return course successfully", async () => {
			const course = { id: "course-id", code: "CS101" };
			mockCoursesService.getCourseForUser.mockResolvedValue(course);

			const response = await controller.getCourse("course-id", {
				user: mockUser,
			} as any);

			expect(response).toEqual({ course });
		});
	});

	describe("createEnrollment", () => {
		const dto: CreateEnrollmentDto = {
			user_id: "user-id",
			role_in_course: "student",
		};

		it("should create enrollment successfully", async () => {
			const enrollment = { id: "enrollment-id", ...dto };
			mockCoursesService.createEnrollment.mockResolvedValue(enrollment);

			const response = await controller.createEnrollment("course-id", dto);

			expect(response).toEqual({ enrollment });
		});
	});

	describe("bulkEnroll", () => {
		const mockFile = {
			buffer: Buffer.from("email,role\ntest@example.com,student"),
		};

		it("should throw UnauthorizedException when user not authenticated", async () => {
			await expect(
				controller.bulkEnroll(
					"course-id",
					mockFile as any,
					{ user: undefined } as any,
				),
			).rejects.toThrow(UnauthorizedException);
		});

		it("should bulk enroll successfully", async () => {
			const result = {
				results: [{ email: "test@example.com", status: "created" }],
			};
			mockCoursesService.bulkEnroll.mockResolvedValue(result);

			const response = await controller.bulkEnroll(
				"course-id",
				mockFile as any,
				{ user: mockUser } as any,
			);

			expect(response).toEqual({
				results: result.results,
				meta: { total: result.results.length },
			});
		});
	});
});
