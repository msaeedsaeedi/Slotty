import { ApiProperty } from "@nestjs/swagger";
import { IsUUID } from "class-validator";

export class CreateBookingDto {
	@ApiProperty({ description: "UUID of the slot to book", format: "uuid" })
	@IsUUID()
	slot_id!: string;
}
