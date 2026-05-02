import { Module } from "@nestjs/common";
import { PrismaModule } from "prisma/prisma.module";
import { AppConfigModule } from "@/common/config/config.module";
import { RedisModule } from "@/common/redis/redis.module";
import { HealthModule } from "@/health/health.module";
import { AssignmentModule } from "@/modules/assignments/assignments.module";
import { AuditModule } from "@/modules/audit/audit.module";
import { AuthModule } from "@/modules/auth/auth.module";
import { BookingsModule } from "@/modules/bookings/bookings.module";
import { CoursesModule } from "@/modules/courses/courses.module";
import { EvaluationsModule } from "@/modules/evaluations/evaluations.module";
import { NotificationsModule } from "@/modules/notifications/notifications.module";
import { SlotsModule } from "@/modules/slots/slots.module";
import { UsersModule } from "@/modules/users/users.module";

@Module({
	imports: [
		AppConfigModule,
		UsersModule,
		PrismaModule,
		AssignmentModule,
		CoursesModule,
		BookingsModule,
		SlotsModule,
		AuthModule,
		RedisModule,
		HealthModule,
		EvaluationsModule,
		AuditModule,
		NotificationsModule,
	],
	controllers: [],
	providers: [],
})
export class AppModule {}
