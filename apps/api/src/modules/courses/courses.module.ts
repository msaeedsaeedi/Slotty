import { Module } from "@nestjs/common";
import { AuditModule } from "@/modules/audit/audit.module";
import { CoursesController } from "./courses.controller";
import { CoursesService } from "./courses.service";

@Module({
	imports: [AuditModule],
	controllers: [CoursesController],
	providers: [CoursesService],
})
export class CoursesModule {}
