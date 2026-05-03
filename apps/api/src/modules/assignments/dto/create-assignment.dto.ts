import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
	IsBoolean,
	IsDate,
	IsInt,
	IsOptional,
	IsString,
	Min,
	MinLength,
} from "class-validator";

export class CreateAssignmentDto {
	@ApiProperty({ description: "Assignment title", minLength: 1 })
	@IsString()
	@MinLength(1)
	title!: string;

	@ApiProperty({ description: "Demo window start time", type: Date })
	@Type(() => Date)
	@IsDate()
	demo_window_start!: Date;

	@ApiProperty({ description: "Demo window end time", type: Date })
	@Type(() => Date)
	@IsDate()
	demo_window_end!: Date;

	@ApiProperty({ description: "Slot duration in minutes", minimum: 1 })
	@Type(() => Number)
	@IsInt()
	@Min(1)
	slot_duration_min!: number;

	@ApiProperty({
		description: "Maximum number of students per slot",
		minimum: 1,
	})
	@Type(() => Number)
	@IsInt()
	@Min(1)
	slot_capacity!: number;

	@ApiProperty({
		description: "Freeze window before slot starts (minutes)",
		minimum: 0,
	})
	@Type(() => Number)
	@IsInt()
	@Min(0)
	freeze_before_min!: number;

	@ApiProperty({
		description: "Maximum allowed cancellations per student",
		minimum: 0,
	})
	@Type(() => Number)
	@IsInt()
	@Min(0)
	max_cancellations!: number;

	@ApiPropertyOptional({
		description: "Default venue for slots in this assignment",
		minLength: 1,
	})
	@IsOptional()
	@IsString()
	@MinLength(1)
	default_venue?: string;

	@ApiPropertyOptional({
		description: "Publish assignment immediately",
		default: false,
	})
	@IsOptional()
	@IsBoolean()
	is_published?: boolean;
}
