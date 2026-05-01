import {
	BadRequestException,
	ForbiddenException,
	Injectable,
} from "@nestjs/common";
import { Assignment, Course, Enrollment, User } from "@prisma/client";
import { PrismaService } from "prisma/prisma.service";
import { CreateAssignmentDto } from "./dto/create-assignment.dto";

@Injectable()
export class AssignmentsService {
	constructor(private readonly prisma: PrismaService) {}

	async createAssignment(
		courseId: string,
		dto: CreateAssignmentDto,
		actor: User,
	): Promise<Assignment> {
		const course = await this.prisma.course.findUnique({
			where: { id: courseId },
		});

		if (!course) {
			throw new Error("Course not found.");
		}

		await this.assertCourseAccess(course, actor, "ta");

		if (dto.demo_window_end <= dto.demo_window_start) {
			throw new BadRequestException("Demo window end must be after start.");
		}

		return this.prisma.assignment.create({
			data: {
				courseId: course.id,
				title: dto.title.trim(),
				demoWindowStart: dto.demo_window_start,
				demoWindowEnd: dto.demo_window_end,
				slotDurationMin: dto.slot_duration_min,
				slotCapacity: dto.slot_capacity,
				freezeBeforeMin: dto.freeze_before_min,
				maxCancellations: dto.max_cancellations,
				defaultVenue: dto.default_venue?.trim() || null,
				isPublished: dto.is_published ?? false,
			},
		});
	}

	private async assertCourseAccess(
		course: Course,
		actor: User,
		requiredRole?: "ta",
	) {
		if (actor.role === "admin") {
			return;
		}
		if (actor.role === "instructor") {
			if (course.ownerId !== actor.id) {
				throw new ForbiddenException("Forbidden.");
			}
			return;
		}
		if (actor.role === "ta") {
			if (requiredRole && requiredRole !== "ta") {
				throw new ForbiddenException("Forbidden.");
			}
			await this.assertEnrollment(course.id, actor.id, "ta");
			return;
		}
		if (actor.role === "student") {
			await this.assertEnrollment(course.id, actor.id, "student");
			return;
		}
		throw new ForbiddenException("Forbidden.");
	}

	private async assertEnrollment(
		courseId: string,
		userId: string,
		roleInCourse: Enrollment["roleInCourse"],
	) {
		const enrollment = await this.prisma.enrollment.findFirst({
			where: { courseId, userId, roleInCourse: { equals: roleInCourse } },
		});
		if (!enrollment) {
			throw new ForbiddenException("Forbidden.");
		}
	}
}
