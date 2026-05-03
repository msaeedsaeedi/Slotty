import { ApiProperty } from "@nestjs/swagger";
import { IsEnum } from "class-validator";

export class UpdateBookingStatusDto {
	@ApiProperty({
		description: "New status for the booking",
		enum: ["completed", "no_show"],
	})
	@IsEnum(["completed", "no_show"])
	status!: "completed" | "no_show";
}
