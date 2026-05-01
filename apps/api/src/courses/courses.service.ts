import {
	BadRequestException,
	ConflictException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { Course, Enrollment, User } from "@prisma/client";
import { PrismaService } from "prisma/prisma.service";
import { isUniqueViolation } from "@/common/prisma-errors";
import { attempt } from "@/utils/attempt.util";
import { CreateCourseDto } from "./dto/create-course.dto";
import { CreateEnrollmentDto } from "./dto/create-enrollment.dto";

@Injectable()
export class CoursesService {
	constructor(private readonly prisma: PrismaService) {}

	async createCourse(dto: CreateCourseDto): Promise<Course> {
		const owner = await this.prisma.user.findUnique({
			where: { id: dto.owner_id },
		});
		if (!owner) {
			throw new NotFoundException("Owner not found.");
		}
		if (owner.role !== "instructor") {
			throw new BadRequestException("Course owner must be an instructor.");
		}

		const [error, course] = await attempt(
			this.prisma.course.create({
				data: {
					code: dto.code.trim(),
					title: dto.title.trim(),
					term: dto.term.trim(),
					ownerId: owner.id,
				},
			}),
		);

		if (error) {
			if (isUniqueViolation(error)) {
				throw new ConflictException(
					"Course code already exists for this term.",
				);
			}
			throw error;
		}

		return course;
	}

	async listCoursesForUser(user: User, term?: string): Promise<Course[]> {
		if (user.role === "admin") {
			return this.listAllCourses(term);
		}
		if (user.role === "instructor") {
			return this.prisma.course.findMany({
				where: {
					ownerId: user.id,
					...(term ? { term } : {}),
				},
				orderBy: { createdAt: "desc" },
			});
		}

		const enrollments = await this.prisma.enrollment.findMany({
			where: { userId: user.id },
			select: { courseId: true },
		});

		const courseIds = enrollments.map((entry) => entry.courseId);
		if (courseIds.length === 0) {
			return [];
		}

		return this.prisma.course.findMany({
			where: { id: { in: courseIds }, ...(term ? { term } : {}) },
			orderBy: { createdAt: "desc" },
		});
	}

	async getCourseForUser(courseId: string, user: User): Promise<Course> {
		const course = await this.getCourse(courseId);
		if (user.role === "admin") {
			return course;
		}
		if (user.role === "instructor" && course.ownerId === user.id) {
			return course;
		}

		const enrollment = await this.prisma.enrollment.findUnique({
			where: { courseId_userId: { courseId: course.id, userId: user.id } },
		});
		if (!enrollment) {
			throw new NotFoundException("Course not found.");
		}
		return course;
	}

	async createEnrollment(
		courseId: string,
		dto: CreateEnrollmentDto,
	): Promise<Enrollment> {
		const course = await this.getCourse(courseId);
		const user = await this.prisma.user.findUnique({
			where: { id: dto.user_id },
		});
		if (!user) {
			throw new NotFoundException("User not found.");
		}

		if (user.role !== dto.role_in_course) {
			throw new BadRequestException("User role does not match course role.");
		}

		const [error, result] = await attempt(
			this.prisma.enrollment.create({
				data: {
					courseId: course.id,
					userId: user.id,
					roleInCourse: dto.role_in_course,
				},
			}),
		);

		if (error) {
			if (isUniqueViolation(error)) {
				throw new ConflictException("User is already enrolled in this course.");
			}
			throw error;
		}

		return result;
	}

	private async listAllCourses(term?: string): Promise<Course[]> {
		return this.prisma.course.findMany({
			...(term ? { where: { term } } : {}),
			orderBy: { createdAt: "desc" },
		});
	}

	private async getCourse(courseId: string): Promise<Course> {
		const course = await this.prisma.course.findUnique({
			where: { id: courseId },
		});
		if (!course) {
			throw new NotFoundException("Course not found.");
		}
		return course;
	}
}
