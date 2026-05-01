import {
	BadRequestException,
	ConflictException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { Course, Enrollment, User } from "@prisma/client";
import { PrismaService } from "prisma/prisma.service";
import { AuditService } from "@/audit/audit.service";
import { isUniqueViolation } from "@/common/prisma-errors";
import { attempt } from "@/utils/attempt.util";
import { CreateCourseDto } from "./dto/create-course.dto";
import { CreateEnrollmentDto } from "./dto/create-enrollment.dto";

@Injectable()
export class CoursesService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly auditService: AuditService,
	) {}

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

	async bulkEnroll(
		courseId: string,
		csvData: string,
		actor: User,
	): Promise<{
		results: Array<{ email: string; status: string; error?: string }>;
	}> {
		const course = await this.getCourse(courseId);

		const rows = this.parseCsvRows(csvData);

		if (rows.length === 0) {
			throw new BadRequestException(
				"CSV file must contain at least one data row with headers: email,role",
			);
		}

		if (rows.length > 1000) {
			throw new BadRequestException(
				"CSV file must not contain more than 1000 rows.",
			);
		}

		const emails = rows.map((r) => r.email.toLowerCase().trim());
		const existingUsers = await this.prisma.user.findMany({
			where: { email: { in: emails } },
		});

		const existingUserMap = new Map<string, User>();
		for (const u of existingUsers) {
			existingUserMap.set(u.email.toLowerCase(), u);
		}

		const missingEmails = emails.filter((e) => !existingUserMap.has(e));
		const uniqueMissingEmails = [...new Set(missingEmails)];

		for (const email of uniqueMissingEmails) {
			const roleFromRow = rows.find(
				(r) => r.email.toLowerCase() === email,
			)!.role_in_course;

			const created = await this.prisma.user.create({
				data: {
					name: email.split("@")[0] ?? "user",
					email,
					role: roleFromRow,
					status: "pending_verification",
				},
			});
			existingUserMap.set(created.email.toLowerCase(), created);
		}

		const validEnrollments: Array<{
			userId: string;
			email: string;
			roleInCourse: "student" | "ta";
		}> = [];
		const results: Array<{
			email: string;
			status: string;
			error?: string;
		}> = [];

		for (const row of rows) {
			const email = row.email.toLowerCase().trim();
			const user = existingUserMap.get(email);

			if (!user) {
				results.push({
					email: row.email,
					status: "error",
					error: "User not found and could not be created",
				});
				continue;
			}

			if (user.role !== row.role_in_course) {
				results.push({
					email: row.email,
					status: "error",
					error: `User role '${user.role}' does not match CSV role '${row.role_in_course}'`,
				});
				continue;
			}

			validEnrollments.push({
				userId: user.id,
				email: user.email,
				roleInCourse: row.role_in_course,
			});
		}

		if (validEnrollments.length > 0) {
			const values = validEnrollments
				.map(
					(e) =>
						`(gen_random_uuid(), '${e.userId}'::uuid, '${course.id}'::uuid, '${e.roleInCourse}'::"CourseRole", NOW())`,
				)
				.join(",\n");

			const result = await this.prisma.$queryRaw<
				{ user_id: string }[]
			>`${this.prisma.$queryRawUnsafe(
				`INSERT INTO enrollments (id, user_id, course_id, role_in_course, created_at) VALUES ${values} ON CONFLICT (course_id, user_id) DO NOTHING RETURNING user_id`,
			)}`;

			const insertedUserIds = new Set(result.map((r) => r.user_id));

			for (const enrollment of validEnrollments) {
				if (insertedUserIds.has(enrollment.userId)) {
					results.push({ email: enrollment.email, status: "created" });
				} else {
					results.push({
						email: enrollment.email,
						status: "already_enrolled",
					});
				}
			}
		}

		const createdCount = results.filter((r) => r.status === "created").length;

		await this.auditService.append({
			actorId: actor.id,
			entityType: "course",
			entityId: course.id,
			eventType: "bulk_enrollment",
			payload: {
				courseId: course.id,
				totalRows: rows.length,
				created: createdCount,
				skipped: results.filter((r) => r.status === "already_enrolled").length,
				errors: results.filter((r) => r.status === "error").length,
			},
		});

		return { results };
	}

	private parseCsvRows(
		csvData: string,
	): Array<{ email: string; role_in_course: "student" | "ta" }> {
		const lines = csvData
			.replace(/\r\n/g, "\n")
			.replace(/\r/g, "\n")
			.split("\n")
			.map((line) => line.trim())
			.filter((line) => line.length > 0);

		if (lines.length < 2) {
			throw new BadRequestException(
				"CSV must contain a header row and at least one data row.",
			);
		}

		const headers = lines[0]!
			.toLowerCase()
			.split(",")
			.map((h) => h.trim());

		const emailIdx = headers.indexOf("email");
		const roleIdx = headers.indexOf("role");

		if (emailIdx === -1 || roleIdx === -1) {
			throw new BadRequestException(
				"CSV must contain 'email' and 'role' columns.",
			);
		}

		const rows: Array<{ email: string; role_in_course: "student" | "ta" }> = [];

		for (let i = 1; i < lines.length; i++) {
			const columns = lines[i]!.split(",").map((c) => c.trim());
			const email = columns[emailIdx];
			const role = columns[roleIdx] as "student" | "ta";

			if (!email || !role) {
				throw new BadRequestException(
					`Row ${i + 1} has missing email or role.`,
				);
			}

			if (role !== "student" && role !== "ta") {
				throw new BadRequestException(
					`Row ${i + 1} has invalid role '${role}'. Must be 'student' or 'ta'.`,
				);
			}

			rows.push({ email, role_in_course: role });
		}

		return rows;
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
