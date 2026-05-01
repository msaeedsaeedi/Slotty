import {
	Body,
	Controller,
	Get,
	Param,
	ParseUUIDPipe,
	Patch,
	Post,
	Query,
	Req,
	UnauthorizedException,
} from "@nestjs/common";
import { User } from "@prisma/client";
import { Roles } from "@/auth/decorators/roles.decorator";
import { BookingsService } from "@/bookings/bookings.service";
import { GenerateSlotsDto } from "./dto/generate-slots.dto";
import { ListSlotsQueryDto } from "./dto/list-slots-query.dto";
import { UpdateSlotDto } from "./dto/update-slot.dto";
import { SlotsService } from "./slots.service";

@Controller({
	version: "1",
})
export class SlotsController {
	constructor(
		private readonly slotsService: SlotsService,
		private readonly bookingsService: BookingsService,
	) {}

	@Post("assignments/:assignmentId/slots/generate")
	@Roles("ta", "admin")
	async generateSlots(
		@Param("assignmentId", ParseUUIDPipe) assignmentId: string,
		@Body() dto: GenerateSlotsDto,
		@Req() req: Request,
	) {
		const user = (req as { user?: User }).user;
		if (!user) {
			throw new UnauthorizedException();
		}
		return this.slotsService.generateSlots(assignmentId, dto, user);
	}

	@Get("assignments/:assignmentId/slots")
	@Roles("student", "ta", "instructor", "admin")
	async listSlots(
		@Param("assignmentId", ParseUUIDPipe) assignmentId: string,
		@Query() query: ListSlotsQueryDto,
		@Req() req: Request,
	) {
		const user = (req as { user?: User }).user;
		if (!user) {
			throw new UnauthorizedException();
		}
		return this.slotsService.listSlots(assignmentId, query, user);
	}

	@Patch("slots/:slotId")
	@Roles("ta", "admin")
	async updateSlot(
		@Param("slotId", ParseUUIDPipe) slotId: string,
		@Body() dto: UpdateSlotDto,
		@Req() req: Request,
	) {
		const user = (req as { user?: User }).user;
		if (!user) {
			throw new UnauthorizedException();
		}
		return this.slotsService.updateSlot(slotId, dto, user);
	}

	@Get("slots/:slotId/bookings")
	@Roles("ta", "admin")
	async getSlotBookings(
		@Param("slotId", ParseUUIDPipe) slotId: string,
		@Req() req: Request,
	) {
		const user = (req as { user?: User }).user;
		if (!user) {
			throw new UnauthorizedException("Unauthorized.");
		}
		const bookings = await this.bookingsService.getSlotBookings(slotId, user);
		return { bookings };
	}
}
