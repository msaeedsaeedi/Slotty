import { IsIn, IsOptional, IsString, MinLength } from "class-validator";

const mutableStatuses = ["draft", "published", "cancelled"] as const;

export class UpdateSlotDto {
	@IsOptional()
	@IsIn(mutableStatuses)
	status?: (typeof mutableStatuses)[number];

	@IsOptional()
	@IsString()
	@MinLength(1)
	venue?: string;
}
