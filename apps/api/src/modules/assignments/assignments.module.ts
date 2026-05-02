import { Module } from "@nestjs/common";
import { AuditModule } from "@/modules/audit/audit.module";
import { AssignmentController } from "./assignments.controller";
import { AssignmentsService } from "./assignments.service";

@Module({
	imports: [AuditModule],
	controllers: [AssignmentController],
	providers: [AssignmentsService],
})
export class AssignmentModule {}
