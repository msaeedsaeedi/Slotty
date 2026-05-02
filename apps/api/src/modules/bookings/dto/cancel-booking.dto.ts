import { IsEnum, IsOptional, IsString, MinLength } from "class-validator";

export class CancelBookingDto {
	@IsEnum(["schedule_conflict", "medical_reasons", "technical_issues", "other"])
	cancel_reason!: string;

	@IsOptional()
	@IsString()
	@MinLength(10)
	cancel_note?: string;
}
