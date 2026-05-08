import {
	Body,
	Controller,
	Param,
	ParseUUIDPipe,
	Post,
	Req,
} from "@nestjs/common";
import {
	ApiCookieAuth,
	ApiOperation,
	ApiParam,
	ApiResponse,
	ApiTags,
} from "@nestjs/swagger";
import { RequestWithUser } from "@/modules/auth/auth.types";
import { Roles } from "@/modules/auth/decorators/roles.decorator";
import { AssignmentsService } from "./assignments.service";
import { CreateAssignmentDto } from "./dto/create-assignment.dto";

@ApiTags("Assignments")
@ApiCookieAuth("session-cookie")
@Controller({
	path: "assignments",
	version: "1",
})
export class AssignmentController {
	constructor(private assignmentsService: AssignmentsService) {}

	@Post(":courseId")
	@ApiOperation({ summary: "Create a new assignment for a course" })
	@ApiParam({
		name: "courseId",
		description: "UUID of the course",
		format: "uuid",
	})
	@ApiResponse({ status: 201, description: "Assignment created successfully" })
	@Roles("ta", "instructor", "admin")
	async createAssignment(
		@Param("courseId", ParseUUIDPipe) courseId: string,
		@Body() dto: CreateAssignmentDto,
		@Req() req: RequestWithUser,
	) {
		const assignment = await this.assignmentsService.createAssignment(
			courseId,
			dto,
			req.user,
		);
		return { assignment };
	}
}
