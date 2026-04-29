import {
	Body,
	Controller,
	Get,
	Param,
	ParseUUIDPipe,
	Patch,
	Post,
} from "@nestjs/common";
import { AssignmentsService } from "./assignments.service.js";
import { CreateAssignmentDto } from "./dto/create-assignment.dto.js";
import { UpdateAssignmentDto } from "./dto/update-assignment.dto.js";

@Controller()
export class AssignmentsController {
	constructor(private readonly assignmentsService: AssignmentsService) {}

	@Post("courses/:courseId/assignments")
	async createAssignment(
		@Param("courseId", ParseUUIDPipe) courseId: string,
		@Body() dto: CreateAssignmentDto,
	) {
		const assignment = await this.assignmentsService.createAssignment(courseId, dto);
		return { assignment };
	}

	@Get("courses/:courseId/assignments")
	async listAssignments(@Param("courseId", ParseUUIDPipe) courseId: string) {
		const assignments = await this.assignmentsService.listAssignments(courseId);
		return { assignments };
	}

	@Get("assignments/:assignmentId")
	async getAssignment(@Param("assignmentId", ParseUUIDPipe) assignmentId: string) {
		const assignment = await this.assignmentsService.getAssignment(assignmentId);
		return { assignment };
	}

	@Patch("assignments/:assignmentId")
	async updateAssignment(
		@Param("assignmentId", ParseUUIDPipe) assignmentId: string,
		@Body() dto: UpdateAssignmentDto,
	) {
		const assignment = await this.assignmentsService.updateAssignment(assignmentId, dto);
		return { assignment };
	}
}
