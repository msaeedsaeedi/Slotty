import {
	Body,
	Controller,
	FileTypeValidator,
	Get,
	MaxFileSizeValidator,
	Param,
	ParseFilePipe,
	ParseUUIDPipe,
	Post,
	Query,
	Req,
	UploadedFile,
	UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { User } from "@prisma/client";
import { UnauthorizedException } from "@/common/exceptions/business.exception";
import { Roles } from "@/modules/auth/decorators/roles.decorator";
import { CoursesService } from "./courses.service";
import { CreateCourseDto } from "./dto/create-course.dto";
import { CreateEnrollmentDto } from "./dto/create-enrollment.dto";

@Controller({
	path: "courses",
	version: "1",
})
export class CoursesController {
	constructor(private readonly coursesService: CoursesService) {}

	@Post()
	@Roles("admin")
	async createCourse(@Body() dto: CreateCourseDto) {
		const course = await this.coursesService.createCourse(dto);
		return { course };
	}

	@Get()
	@Roles("student", "ta", "instructor", "admin")
	async listCourses(
		@Query("term") term: string | undefined,
		@Req() req: Request,
	) {
		const user = (req as { user?: User }).user;
		if (!user) {
			throw new UnauthorizedException();
		}

		const courses = await this.coursesService.listCoursesForUser(user, term);
		return { courses, meta: { total: courses.length } };
	}

	@Get(":courseId")
	@Roles("student", "ta", "instructor", "admin")
	async getCourse(
		@Param("courseId", ParseUUIDPipe) courseId: string,
		@Req() req: Request,
	) {
		const user = (req as { user?: User }).user;
		if (!user) {
			throw new UnauthorizedException();
		}
		const course = await this.coursesService.getCourseForUser(courseId, user);
		return { course };
	}

	@Post(":courseId/enrollments")
	@Roles("admin")
	async createEnrollment(
		@Param("courseId", ParseUUIDPipe) courseId: string,
		@Body() dto: CreateEnrollmentDto,
	) {
		const enrollment = await this.coursesService.createEnrollment(
			courseId,
			dto,
		);
		return { enrollment };
	}

	// TODO: Implement CSV streaming for large files instead of loading entire file into memory
	@Post(":courseId/enrollments/bulk")
	@Roles("admin")
	@UseInterceptors(FileInterceptor("file"))
	async bulkEnroll(
		@Param("courseId", ParseUUIDPipe) courseId: string,
		@UploadedFile(
			new ParseFilePipe({
				validators: [
					new MaxFileSizeValidator({ maxSize: 1024 * 1024 }),
					new FileTypeValidator({
						fileType: /text\/csv|application\/vnd\.ms-excel/,
					}),
				],
			}),
		)
		file: { buffer: Buffer },
		@Req() req: Request,
	) {
		const user = (req as { user?: User }).user;
		if (!user) {
			throw new UnauthorizedException();
		}

		const csvData = file.buffer.toString("utf-8");

		const result = await this.coursesService.bulkEnroll(
			courseId,
			csvData,
			user,
		);

		return { results: result.results, meta: { total: result.results.length } };
	}
}
