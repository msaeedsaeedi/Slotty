import { Module } from "@nestjs/common";
import { AssignmentController } from "./assignments.controller";
import { AssignmentsService } from "./assignments.service";

@Module({
	controllers: [AssignmentController],
	providers: [AssignmentsService],
})
export class AssignmentModule {}
