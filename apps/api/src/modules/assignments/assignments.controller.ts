import {
	Body,
	Controller,
	Param,
	ParseUUIDPipe,
	Post,
	Req,
} from "@nestjs/common";
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
import { User } from "@prisma/client";
import { UnauthorizedException } from "@/common/exceptions/business.exception";
import { Roles } from "@/modules/auth/decorators/roles.decorator";
import { AssignmentsService } from "./assignments.service";
import { CreateAssignmentDto } from "./dto/create-assignment.dto";

@ApiTags("Assignments")
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
		@Req() req: Request,
	) {
		const user = (req as { user?: User }).user;
		if (!user) {
			throw new UnauthorizedException();
		}
		const assignment = await this.assignmentsService.createAssignment(
			courseId,
			dto,
			user,
		);
		return { assignment };
	}
}
