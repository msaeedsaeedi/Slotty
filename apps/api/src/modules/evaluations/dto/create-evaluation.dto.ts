import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
	IsNumber,
	IsObject,
	IsOptional,
	IsString,
	IsUUID,
	Max,
	MaxLength,
	Min,
} from "class-validator";

export class CreateEvaluationDto {
	@ApiProperty({
		description: "UUID of the booking to evaluate",
		format: "uuid",
	})
	@IsUUID()
	bookingId!: string;

	/**
	 * Flexible rubric map: { "design": 8, "functionality": 9, "presentation": 7 }.
	 * The structure is assignment-specific and validated by the TA.
	 */
	@ApiPropertyOptional({
		description: "Rubric scores as key-value pairs (assignment-specific)",
	})
	@IsOptional()
	@IsObject()
	rubricScores?: Record<string, number>;

	/** Stored as DECIMAL(5,2) — max 999.99 */
	@ApiPropertyOptional({
		description: "Total score (0-999.99, up to 2 decimal places)",
		minimum: 0,
		maximum: 999.99,
	})
	@IsOptional()
	@IsNumber({ maxDecimalPlaces: 2 })
	@Min(0)
	@Max(999.99)
	totalScore?: number;

	/** Visible to TA only; never returned to instructors or students. */
	@ApiPropertyOptional({
		description: "Private note visible to TA only (max 5000 chars)",
		maxLength: 5000,
	})
	@IsOptional()
	@IsString()
	@MaxLength(5000)
	privateNote?: string;
}
