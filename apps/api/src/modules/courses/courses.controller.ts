import {
	Body,
	Controller,
	Get,
	Param,
	ParseUUIDPipe,
	Post,
	Query,
} from "@nestjs/common";
import { BulkEnrollmentDto } from "./dto/bulk-enrollment.dto.js";
import { CreateCourseDto } from "./dto/create-course.dto.js";
import { CreateEnrollmentDto } from "./dto/create-enrollment.dto.js";
import { CoursesService } from "./courses.service.js";

@Controller("courses")
export class CoursesController {
	constructor(private readonly coursesService: CoursesService) {}

	@Post()
	async createCourse(@Body() dto: CreateCourseDto) {
		const course = await this.coursesService.createCourse(dto);
		return { course };
	}

	@Get()
	async listCourses(@Query("term") term?: string) {
		const courses = await this.coursesService.listCourses(term);
		return { courses, meta: { total: courses.length } };
	}

	@Get(":courseId")
	async getCourse(@Param("courseId", ParseUUIDPipe) courseId: string) {
		const course = await this.coursesService.getCourse(courseId);
		return { course };
	}

	@Post(":courseId/enrollments")
	async createEnrollment(
		@Param("courseId", ParseUUIDPipe) courseId: string,
		@Body() dto: CreateEnrollmentDto,
	) {
		const enrollment = await this.coursesService.createEnrollment(courseId, dto);
		return { enrollment };
	}

	@Post(":courseId/enrollments/bulk")
	async bulkEnroll(
		@Param("courseId", ParseUUIDPipe) courseId: string,
		@Body() dto: BulkEnrollmentDto,
	) {
		return this.coursesService.bulkEnroll(courseId, dto);
	}
}
