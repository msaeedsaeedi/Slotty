import { IsUUID } from "class-validator";

export class RescheduleBookingDto {
	@IsUUID()
	new_slot_id!: string;
}
