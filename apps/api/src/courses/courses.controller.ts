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
	UnauthorizedException,
	UploadedFile,
	UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { User } from "@prisma/client";
import { Roles } from "@/auth/decorators/roles.decorator";
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

	// TODO: add endpoint for bulk enrollment via CSV upload
}
