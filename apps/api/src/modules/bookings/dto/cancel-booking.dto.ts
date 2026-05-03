import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString, MinLength } from "class-validator";

export class CancelBookingDto {
	@ApiProperty({
		description: "Reason for cancelling the booking",
		enum: ["schedule_conflict", "medical_reasons", "technical_issues", "other"],
	})
	@IsEnum(["schedule_conflict", "medical_reasons", "technical_issues", "other"])
	cancel_reason!: string;

	@ApiPropertyOptional({
		description:
			"Additional details when reason is 'other' (min 10 characters)",
		minLength: 10,
	})
	@IsOptional()
	@IsString()
	@MinLength(10)
	cancel_note?: string;
}
