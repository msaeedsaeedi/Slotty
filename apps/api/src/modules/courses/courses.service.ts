import {
	BadRequestException,
	ConflictException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { QueryFailedError, Repository } from "typeorm";
import { Course } from "../../database/entities/course.entity.js";
import { Enrollment } from "../../database/entities/enrollment.entity.js";
import { User } from "../../database/entities/user.entity.js";
import { UsersService } from "../users/users.service.js";
import { BulkEnrollmentDto } from "./dto/bulk-enrollment.dto.js";
import { CreateCourseDto } from "./dto/create-course.dto.js";
import { CreateEnrollmentDto } from "./dto/create-enrollment.dto.js";

const uniqueViolationCode = "23505";

type BulkEnrollmentResult = {
	email: string;
	status: "created" | "already_enrolled" | "invalid" | "role_mismatch";
	message?: string;
};

@Injectable()
export class CoursesService {
	constructor(
		@InjectRepository(Course)
		private readonly coursesRepository: Repository<Course>,
		@InjectRepository(Enrollment)
		private readonly enrollmentsRepository: Repository<Enrollment>,
		@InjectRepository(User)
		private readonly usersRepository: Repository<User>,
		private readonly usersService: UsersService,
	) {}

	async createCourse(dto: CreateCourseDto): Promise<Course> {
		const owner = await this.usersRepository.findOne({
			where: { id: dto.owner_id },
		});
		if (!owner) {
			throw new NotFoundException("Owner not found.");
		}
		if (owner.role !== "instructor") {
			throw new BadRequestException("Course owner must be an instructor.");
		}

		const course = this.coursesRepository.create({
			code: dto.code.trim(),
			title: dto.title.trim(),
			term: dto.term.trim(),
			ownerId: owner.id,
		});

		try {
			return await this.coursesRepository.save(course);
		} catch (error) {
			if (error instanceof QueryFailedError && this.isUniqueViolation(error)) {
				throw new ConflictException("Course code already exists for this term.");
			}
			throw error;
		}
	}

	async listCourses(term?: string): Promise<Course[]> {
		if (!term) {
			return this.coursesRepository.find({ order: { createdAt: "DESC" } });
		}
		return this.coursesRepository.find({
			where: { term },
			order: { createdAt: "DESC" },
		});
	}

	async getCourse(courseId: string): Promise<Course> {
		const course = await this.coursesRepository.findOne({ where: { id: courseId } });
		if (!course) {
			throw new NotFoundException("Course not found.");
		}
		return course;
	}

	async createEnrollment(courseId: string, dto: CreateEnrollmentDto): Promise<Enrollment> {
		const course = await this.getCourse(courseId);
		const user = await this.usersRepository.findOne({ where: { id: dto.user_id } });
		if (!user) {
			throw new NotFoundException("User not found.");
		}

		if (user.role !== dto.role_in_course) {
			throw new BadRequestException("User role does not match course role.");
		}

		const enrollment = this.enrollmentsRepository.create({
			courseId: course.id,
			userId: user.id,
			roleInCourse: dto.role_in_course,
		});

		try {
			return await this.enrollmentsRepository.save(enrollment);
		} catch (error) {
			if (error instanceof QueryFailedError && this.isUniqueViolation(error)) {
				throw new ConflictException("User is already enrolled in this course.");
			}
			throw error;
		}
	}

	async bulkEnroll(courseId: string, dto: BulkEnrollmentDto) {
		await this.getCourse(courseId);

		const lines = dto.csv_data
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter((line) => line.length > 0);

		if (lines.length === 0) {
			return { results: [] as BulkEnrollmentResult[] };
		}

		const header = lines.shift()?.split(",").map((value) => value.trim().toLowerCase());
		if (!header || header[0] !== "email" || header[1] !== "role") {
			throw new BadRequestException("CSV header must be: email,role");
		}

		const results: BulkEnrollmentResult[] = [];

		for (const row of lines) {
			const [emailRaw, roleRaw] = row.split(",").map((value) => value.trim());
			if (!emailRaw || !roleRaw) {
				results.push({
					email: emailRaw ?? "",
					status: "invalid",
					message: "Missing email or role.",
				});
				continue;
			}

			let email: string;
			try {
				email = this.usersService.normalizeEmail(emailRaw);
			} catch (error) {
				results.push({
					email: emailRaw,
					status: "invalid",
					message: "Invalid email address.",
				});
				continue;
			}

			const role = roleRaw.toLowerCase();
			if (role !== "student" && role !== "ta") {
				results.push({
					email,
					status: "invalid",
					message: "Role must be student or ta.",
				});
				continue;
			}

			let user: User;
			try {
				user = await this.usersService.ensureUserRole(email, role);
			} catch (error) {
				results.push({
					email,
					status: "role_mismatch",
					message: "Existing user has a different role.",
				});
				continue;
			}

			const enrollment = this.enrollmentsRepository.create({
				courseId,
				userId: user.id,
				roleInCourse: role,
			});

			try {
				await this.enrollmentsRepository.save(enrollment);
				results.push({ email, status: "created" });
			} catch (error) {
				if (error instanceof QueryFailedError && this.isUniqueViolation(error)) {
					results.push({ email, status: "already_enrolled" });
					continue;
				}
				throw error;
			}
		}

		return { results };
	}

	private isUniqueViolation(error: QueryFailedError): boolean {
		const driverError = error.driverError as { code?: string } | undefined;
		return driverError?.code === uniqueViolationCode;
	}
}
