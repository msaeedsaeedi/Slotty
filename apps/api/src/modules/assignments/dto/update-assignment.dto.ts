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

export class UpdateAssignmentDto {
	@IsOptional()
	@IsString()
	@MinLength(1)
	title?: string;

	@IsOptional()
	@Type(() => Date)
	@IsDate()
	demo_window_start?: Date;

	@IsOptional()
	@Type(() => Date)
	@IsDate()
	demo_window_end?: Date;

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	slot_duration_min?: number;

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	capacity?: number;

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(0)
	freeze_before_min?: number;

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(0)
	max_cancellations?: number;

	@IsOptional()
	@IsString()
	@MinLength(1)
	default_venue?: string;

	@IsOptional()
	@IsBoolean()
	is_published?: boolean;
}
