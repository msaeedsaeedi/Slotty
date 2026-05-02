import { Module } from "@nestjs/common";
import { AuditModule } from "@/modules/audit/audit.module";
import { BookingsService } from "@/modules/bookings/bookings.service";
import { SlotsController } from "./slots.controller";
import { SlotsService } from "./slots.service";

@Module({
	imports: [AuditModule],
	controllers: [SlotsController],
	providers: [SlotsService, BookingsService],
})
export class SlotsModule {}
