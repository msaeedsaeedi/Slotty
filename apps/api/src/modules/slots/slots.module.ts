import { Module } from "@nestjs/common";
import { AuditModule } from "@/modules/audit/audit.module";
import { BookingsService } from "@/modules/bookings/bookings.service";
import { NotificationsModule } from "@/modules/notifications/notifications.module";
import { SlotsController } from "./slots.controller";
import { SlotsService } from "./slots.service";

@Module({
	imports: [AuditModule, NotificationsModule],
	controllers: [SlotsController],
	providers: [SlotsService, BookingsService],
})
export class SlotsModule {}
