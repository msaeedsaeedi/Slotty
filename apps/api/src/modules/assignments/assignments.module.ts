import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Assignment } from "../../database/entities/assignment.entity.js";
import { Course } from "../../database/entities/course.entity.js";
import { AssignmentsController } from "./assignments.controller.js";
import { AssignmentsService } from "./assignments.service.js";

@Module({
	imports: [TypeOrmModule.forFeature([Assignment, Course])],
	controllers: [AssignmentsController],
	providers: [AssignmentsService],
})
export class AssignmentsModule {}
