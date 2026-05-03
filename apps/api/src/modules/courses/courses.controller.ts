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
import {
	ApiBody,
	ApiConsumes,
	ApiOperation,
	ApiParam,
	ApiResponse,
	ApiTags,
} from "@nestjs/swagger";
import { RequestWithUser } from "@/modules/auth/auth.types";
import { Roles } from "@/modules/auth/decorators/roles.decorator";
import { CoursesService } from "./courses.service";
import { CreateCourseDto } from "./dto/create-course.dto";
import { CreateEnrollmentDto } from "./dto/create-enrollment.dto";

@ApiTags("Courses")
@Controller({
	path: "courses",
	version: "1",
})
export class CoursesController {
	constructor(private readonly coursesService: CoursesService) {}

	@Post()
	@ApiOperation({ summary: "Create a new course" })
	@ApiResponse({ status: 201, description: "Course created successfully" })
	@Roles("admin")
	async createCourse(@Body() dto: CreateCourseDto) {
		const course = await this.coursesService.createCourse(dto);
		return { course };
	}

	@Get()
	@ApiOperation({ summary: "List courses for the authenticated user" })
	@ApiResponse({ status: 200, description: "List of courses" })
	@Roles("student", "ta", "instructor", "admin")
	async listCourses(
		@Query("term") term: string | undefined,
		@Req() req: RequestWithUser,
	) {
		const courses = await this.coursesService.listCoursesForUser(
			req.user,
			term,
		);
		return { courses, meta: { total: courses.length } };
	}

	@Get(":courseId")
	@ApiOperation({ summary: "Get a specific course by ID" })
	@ApiParam({
		name: "courseId",
		description: "UUID of the course",
		format: "uuid",
	})
	@ApiResponse({ status: 200, description: "Course details" })
	@ApiResponse({ status: 404, description: "Course not found" })
	@Roles("student", "ta", "instructor", "admin")
	async getCourse(
		@Param("courseId", ParseUUIDPipe) courseId: string,
		@Req() req: RequestWithUser,
	) {
		const course = await this.coursesService.getCourseForUser(
			courseId,
			req.user,
		);
		return { course };
	}

	@Post(":courseId/enrollments")
	@ApiOperation({ summary: "Enroll a user in a course" })
	@ApiParam({
		name: "courseId",
		description: "UUID of the course",
		format: "uuid",
	})
	@ApiResponse({ status: 201, description: "Enrollment created successfully" })
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
	@ApiOperation({ summary: "Bulk enroll students from CSV file" })
	@ApiParam({
		name: "courseId",
		description: "UUID of the course",
		format: "uuid",
	})
	@ApiConsumes("multipart/form-data")
	@ApiBody({
		description: "CSV file with columns: email, role_in_course (student/ta)",
		schema: {
			type: "object",
			properties: { file: { type: "string", format: "binary" } },
		},
	})
	@ApiResponse({ status: 201, description: "Bulk enrollment processed" })
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
		@Req() req: RequestWithUser,
	) {
		const csvData = file.buffer.toString("utf-8");

		const result = await this.coursesService.bulkEnroll(
			courseId,
			csvData,
			req.user,
		);

		return { results: result.results, meta: { total: result.results.length } };
	}
}
