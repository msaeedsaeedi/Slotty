import { Module } from "@nestjs/common";
import { AuditModule } from "@/modules/audit/audit.module";
import { BookingsController } from "./bookings.controller";
import { BookingsService } from "./bookings.service";

@Module({
	imports: [AuditModule],
	controllers: [BookingsController],
	providers: [BookingsService],
})
export class BookingsModule {}
