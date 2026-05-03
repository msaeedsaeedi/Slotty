import { ApiProperty } from "@nestjs/swagger";
import { IsUUID } from "class-validator";

export class GenerateSlotsDto {
	@ApiProperty({
		description: "UUID of the TA to generate slots for",
		format: "uuid",
	})
	@IsUUID()
	ta_id!: string;
}
