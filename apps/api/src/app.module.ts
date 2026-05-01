import { Module } from "@nestjs/common";
import { PrismaModule } from "prisma/prisma.module";
import { AssignmentModule } from "./assignments/assignments.module";
import { AppConfigModule } from "./config/config.module";
import { CoursesModule } from "./courses/courses.module";
import { UsersModule } from "./users/users.module";
import { BookingsModule } from './bookings/bookings.module';
import { SlotsModule } from './slots/slots.module';

@Module({
	imports: [
		AppConfigModule,
		UsersModule,
		PrismaModule,
		AssignmentModule,
		CoursesModule,
		BookingsModule,
		SlotsModule,
	],
	controllers: [],
	providers: [],
})
export class AppModule {}
