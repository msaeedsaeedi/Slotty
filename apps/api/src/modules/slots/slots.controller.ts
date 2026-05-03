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
} from "@nestjs/common";
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
import { User } from "@prisma/client";
import { UnauthorizedException } from "@/common/exceptions/business.exception";
import { Roles } from "@/modules/auth/decorators/roles.decorator";
import { BookingsService } from "@/modules/bookings/bookings.service";
import { GenerateSlotsDto } from "./dto/generate-slots.dto";
import { ListSlotsQueryDto } from "./dto/list-slots-query.dto";
import { UpdateSlotDto } from "./dto/update-slot.dto";
import { SlotsService } from "./slots.service";

@ApiTags("Slots")
@Controller({
	version: "1",
})
export class SlotsController {
	constructor(
		private readonly slotsService: SlotsService,
		private readonly bookingsService: BookingsService,
	) {}

	@Post("assignments/:assignmentId/slots/generate")
	@ApiOperation({ summary: "Generate slots for a TA in an assignment" })
	@ApiParam({
		name: "assignmentId",
		description: "UUID of the assignment",
		format: "uuid",
	})
	@ApiResponse({ status: 201, description: "Slots generated successfully" })
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
	@ApiOperation({ summary: "List slots for an assignment" })
	@ApiParam({
		name: "assignmentId",
		description: "UUID of the assignment",
		format: "uuid",
	})
	@ApiResponse({ status: 200, description: "List of slots" })
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
	@ApiOperation({ summary: "Update a slot (status or venue)" })
	@ApiParam({ name: "slotId", description: "UUID of the slot", format: "uuid" })
	@ApiResponse({ status: 200, description: "Slot updated successfully" })
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
	@ApiOperation({ summary: "Get all bookings for a specific slot" })
	@ApiParam({ name: "slotId", description: "UUID of the slot", format: "uuid" })
	@ApiResponse({ status: 200, description: "List of bookings for the slot" })
	@Roles("ta", "admin")
	async getSlotBookings(
		@Param("slotId", ParseUUIDPipe) slotId: string,
		@Req() req: Request,
	) {
		const user = (req as { user?: User }).user;
		if (!user) {
			throw new UnauthorizedException();
		}
		const bookings = await this.bookingsService.getSlotBookings(slotId, user);
		return { bookings };
	}
}
