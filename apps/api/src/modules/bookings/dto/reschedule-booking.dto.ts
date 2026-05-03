import { ApiProperty } from "@nestjs/swagger";
import { IsUUID } from "class-validator";

export class RescheduleBookingDto {
	@ApiProperty({
		description: "UUID of the new slot to reschedule to",
		format: "uuid",
	})
	@IsUUID()
	new_slot_id!: string;
}
