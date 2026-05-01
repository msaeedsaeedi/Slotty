import { Module } from "@nestjs/common";
import { BookingsService } from "@/bookings/bookings.service";
import { SlotsController } from "./slots.controller";
import { SlotsService } from "./slots.service";

@Module({
	controllers: [SlotsController],
	providers: [SlotsService, BookingsService],
})
export class SlotsModule {}
