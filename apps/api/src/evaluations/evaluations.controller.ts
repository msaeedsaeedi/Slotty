import {
	Body,
	Controller,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	ParseUUIDPipe,
	Patch,
	Post,
	Query,
	Req,
} from "@nestjs/common";
import { User, UserRole } from "@prisma/client";
import { Request } from "express";
import { Roles } from "@/auth/decorators/roles.decorator";
import { CreateEvaluationDto } from "./dto/create-evaluation.dto";
import { QueryEvaluationsDto } from "./dto/query-evaluations.dto";
import { UpdateEvaluationDto } from "./dto/update-evaluation.dto";
import { EvaluationsService } from "./evaluations.service";

/**
 * All evaluation routes live here, including the two that are nested
 * under /assignments and /courses in the API contract.
 *
 * Route summary
 * ─────────────────────────────────────────────────────────────────────
 * POST   /evaluations                                  ta, admin
 * GET    /evaluations/:id                              ta, instructor, admin
 * PATCH  /evaluations/:id                              ta, admin
 * POST   /assignments/:assignmentId/evaluations/submit ta, admin
 * GET    /courses/:courseId/evaluations                instructor, admin
 * ─────────────────────────────────────────────────────────────────────
 */
@Controller({
	version: "1",
})
export class EvaluationsController {
	constructor(private readonly evaluationsService: EvaluationsService) {}

	// ─── POST /evaluations ──────────────────────────────────────────────────

	@Post("evaluations")
	@Roles("ta", "admin")
	@HttpCode(HttpStatus.CREATED)
	async create(@Req() req: Request, @Body() dto: CreateEvaluationDto) {
		const user = (req as { user?: User }).user;
		const evaluation = await this.evaluationsService.create(user!.id, dto);
		return { evaluation };
	}

	// ─── GET /evaluations/:id ───────────────────────────────────────────────

	@Get("evaluations/:id")
	@Roles("ta", "instructor", "admin")
	async findOne(@Req() req: Request, @Param("id", ParseUUIDPipe) id: string) {
		const user = (req as { user?: User }).user;
		const evaluation = await this.evaluationsService.findOne(
			user!.id,
			user!.role as UserRole,
			id,
		);
		return { evaluation };
	}

	// ─── PATCH /evaluations/:id ─────────────────────────────────────────────

	@Patch("evaluations/:id")
	@Roles("ta", "admin")
	async update(
		@Req() req: Request,
		@Param("id", ParseUUIDPipe) id: string,
		@Body() dto: UpdateEvaluationDto,
	) {
		const user = (req as { user?: User }).user;
		const evaluation = await this.evaluationsService.update(
			user!.id,
			user!.role as UserRole,
			id,
			dto,
		);
		return { evaluation };
	}

	// ─── POST /assignments/:assignmentId/evaluations/submit ─────────────────

	/**
	 * Atomically submits all unsubmitted evaluations for the TA's slots
	 * within the assignment, making them visible to the instructor.
	 * Admins may submit evaluations across all TAs for the assignment.
	 */
	@Post("assignments/:assignmentId/evaluations/submit")
	@Roles("ta", "admin")
	async submitBatch(
		@Req() req: Request,
		@Param("assignmentId", ParseUUIDPipe) assignmentId: string,
	) {
		const user = (req as { user?: User }).user;
		const result = await this.evaluationsService.submitBatch(
			user!.id,
			user!.role as UserRole,
			assignmentId,
		);
		return result; // { submitted: number; submittedAt: Date }
	}

	// ─── GET /courses/:courseId/evaluations ─────────────────────────────────

	/**
	 * Returns all submitted evaluations for a course.
	 * `privateNote` is stripped — it is TA-private even post-submission.
	 * Optionally filtered by assignmentId via query param.
	 */
	@Get("courses/:courseId/evaluations")
	@Roles("instructor", "admin")
	async findByCourse(
		@Param("courseId", ParseUUIDPipe) courseId: string,
		@Query() query: QueryEvaluationsDto,
	) {
		const evaluations = await this.evaluationsService.findByCourse(
			courseId,
			query,
		);
		return { evaluations };
	}
}
