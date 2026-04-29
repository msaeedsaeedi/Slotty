import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { validateEnv } from "./config/env.validation.js";
import { DatabaseModule } from "./database/database.module.js";
import { HealthModule } from "./health/health.module.js";
import { AssignmentsModule } from "./modules/assignments/assignments.module.js";
import { CoursesModule } from "./modules/courses/courses.module.js";
import { SlotsModule } from "./modules/slots/slots.module.js";
import { UsersModule } from "./modules/users/users.module.js";

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
			validate: validateEnv,
		}),
		DatabaseModule,
		HealthModule,
		UsersModule,
		CoursesModule,
		AssignmentsModule,
		SlotsModule,
	],
})
export class AppModule {}
