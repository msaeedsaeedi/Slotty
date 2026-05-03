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
import {
	ApiBody,
	ApiOperation,
	ApiParam,
	ApiQuery,
	ApiResponse,
	ApiTags,
} from "@nestjs/swagger";
import { RequestWithUser } from "@/modules/auth/auth.types";
import { Roles } from "@/modules/auth/decorators/roles.decorator";
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
@ApiTags("Evaluations")
@Controller({
	version: "1",
})
export class EvaluationsController {
	constructor(private readonly evaluationsService: EvaluationsService) {}

	// ─── POST /evaluations ──────────────────────────────────────────────────

	@Post("evaluations")
	@ApiOperation({ summary: "Create a new evaluation" })
	@ApiBody({ type: CreateEvaluationDto })
	@ApiResponse({ status: 201, description: "Evaluation created successfully" })
	@Roles("ta", "admin")
	@HttpCode(HttpStatus.CREATED)
	async create(@Req() req: RequestWithUser, @Body() dto: CreateEvaluationDto) {
		const evaluation = await this.evaluationsService.create(req.user.id, dto);
		return { evaluation };
	}

	// ─── GET /evaluations/:id ───────────────────────────────────────────────

	@Get("evaluations/:id")
	@ApiOperation({ summary: "Get an evaluation by ID" })
	@ApiParam({
		name: "id",
		description: "UUID of the evaluation",
		format: "uuid",
	})
	@ApiResponse({ status: 200, description: "Evaluation details" })
	@ApiResponse({ status: 404, description: "Evaluation not found" })
	@Roles("ta", "instructor", "admin")
	async findOne(
		@Req() req: RequestWithUser,
		@Param("id", ParseUUIDPipe) id: string,
	) {
		const evaluation = await this.evaluationsService.findOne(
			req.user.id,
			req.user.role,
			id,
		);
		return { evaluation };
	}

	// ─── PATCH /evaluations/:id ─────────────────────────────────────────────

	@Patch("evaluations/:id")
	@ApiOperation({ summary: "Update an evaluation" })
	@ApiParam({
		name: "id",
		description: "UUID of the evaluation",
		format: "uuid",
	})
	@ApiBody({ type: UpdateEvaluationDto })
	@ApiResponse({ status: 200, description: "Evaluation updated successfully" })
	@Roles("ta", "admin")
	async update(
		@Req() req: RequestWithUser,
		@Param("id", ParseUUIDPipe) id: string,
		@Body() dto: UpdateEvaluationDto,
	) {
		const evaluation = await this.evaluationsService.update(
			req.user.id,
			req.user.role,
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
	@ApiOperation({ summary: "Submit all evaluations for an assignment" })
	@ApiParam({
		name: "assignmentId",
		description: "UUID of the assignment",
		format: "uuid",
	})
	@ApiResponse({
		status: 200,
		description: "Evaluations submitted successfully",
	})
	@Roles("ta", "admin")
	async submitBatch(
		@Req() req: RequestWithUser,
		@Param("assignmentId", ParseUUIDPipe) assignmentId: string,
	) {
		const result = await this.evaluationsService.submitBatch(
			req.user.id,
			req.user.role,
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
	@ApiOperation({ summary: "Get all evaluations for a course" })
	@ApiParam({
		name: "courseId",
		description: "UUID of the course",
		format: "uuid",
	})
	@ApiQuery({
		name: "assignmentId",
		required: false,
		description: "Filter by assignment UUID",
		format: "uuid",
	})
	@ApiResponse({ status: 200, description: "List of evaluations" })
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
