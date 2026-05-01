import { Module } from "@nestjs/common";
import { PrismaModule } from "prisma/prisma.module";
import { AssignmentModule } from "./assignments/assignments.module";
import { AuthModule } from "./auth/auth.module";
import { BookingsModule } from "./bookings/bookings.module";
import { RedisModule } from "./common/redis/redis.module";
import { AppConfigModule } from "./config/config.module";
import { CoursesModule } from "./courses/courses.module";
import { SlotsModule } from "./slots/slots.module";
import { UsersModule } from "./users/users.module";

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
	],
	controllers: [],
	providers: [],
})
export class AppModule {}
