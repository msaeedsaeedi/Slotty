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
	@IsUUID()
	bookingId!: string;

	/**
	 * Flexible rubric map: { "design": 8, "functionality": 9, "presentation": 7 }.
	 * The structure is assignment-specific and validated by the TA.
	 */
	@IsOptional()
	@IsObject()
	rubricScores?: Record<string, number>;

	/** Stored as DECIMAL(5,2) — max 999.99 */
	@IsOptional()
	@IsNumber({ maxDecimalPlaces: 2 })
	@Min(0)
	@Max(999.99)
	totalScore?: number;

	/** Visible to TA only; never returned to instructors or students. */
	@IsOptional()
	@IsString()
	@MaxLength(5000)
	privateNote?: string;
}
