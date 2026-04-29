import {
	Body,
	Controller,
	Get,
	Param,
	ParseUUIDPipe,
	Patch,
	Post,
	Query,
} from "@nestjs/common";
import { GenerateSlotsDto } from "./dto/generate-slots.dto.js";
import { ListSlotsQueryDto } from "./dto/list-slots-query.dto.js";
import { UpdateSlotDto } from "./dto/update-slot.dto.js";
import { SlotsService } from "./slots.service.js";

@Controller()
export class SlotsController {
	constructor(private readonly slotsService: SlotsService) {}

	@Post("assignments/:assignmentId/slots/generate")
	async generateSlots(
		@Param("assignmentId", ParseUUIDPipe) assignmentId: string,
		@Body() dto: GenerateSlotsDto,
	) {
		return this.slotsService.generateSlots(assignmentId, dto);
	}

	@Get("assignments/:assignmentId/slots")
	async listSlots(
		@Param("assignmentId", ParseUUIDPipe) assignmentId: string,
		@Query() query: ListSlotsQueryDto,
	) {
		return this.slotsService.listSlots(assignmentId, query);
	}

	@Patch("slots/:slotId")
	async updateSlot(
		@Param("slotId", ParseUUIDPipe) slotId: string,
		@Body() dto: UpdateSlotDto,
	) {
		return this.slotsService.updateSlot(slotId, dto);
	}
}
