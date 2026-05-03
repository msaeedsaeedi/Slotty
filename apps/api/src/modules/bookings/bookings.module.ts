import { Module } from "@nestjs/common";
import { AuditModule } from "@/modules/audit/audit.module";
import { NotificationsModule } from "@/modules/notifications/notifications.module";
import { BookingsController } from "./bookings.controller";
import { BookingsService } from "./bookings.service";

@Module({
	imports: [AuditModule, NotificationsModule],
	controllers: [BookingsController],
	providers: [BookingsService],
})
export class BookingsModule {}
