import type { DataSourceOptions } from "typeorm";
import { Assignment } from "./entities/assignment.entity.js";
import { Course } from "./entities/course.entity.js";
import { DemoSlot } from "./entities/demo-slot.entity.js";
import { Enrollment } from "./entities/enrollment.entity.js";
import { User } from "./entities/user.entity.js";

export function buildDataSourceOptions(databaseUrl: string): DataSourceOptions {
	return {
		type: "postgres",
		url: databaseUrl,
		entities: [User, Course, Enrollment, Assignment, DemoSlot],
		migrations: ["src/database/migrations/*.ts", "dist/database/migrations/*.js"],
		synchronize: false,
		logging: false,
	};
}
