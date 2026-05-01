import {
	Body,
	Controller,
	Param,
	ParseUUIDPipe,
	Post,
	Req,
	UnauthorizedException,
} from "@nestjs/common";
import { User } from "@prisma/client";
import { Roles } from "@/auth/decorators/roles.decorator";
import { AssignmentsService } from "./assignments.service";
import { CreateAssignmentDto } from "./dto/create-assignment.dto";

@Controller({
	path: "assignments",
	version: "1",
})
export class AssignmentController {
	constructor(private assignmentsService: AssignmentsService) {}

	@Post(":courseId")
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
