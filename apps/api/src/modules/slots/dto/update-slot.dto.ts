import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, MinLength } from "class-validator";

const mutableStatuses = ["draft", "published", "cancelled"] as const;

export class UpdateSlotDto {
	@ApiPropertyOptional({
		description: "New status for the slot",
		enum: ["draft", "published", "cancelled"],
	})
	@IsOptional()
	@IsIn(mutableStatuses)
	status?: (typeof mutableStatuses)[number];

	@ApiPropertyOptional({ description: "Venue for the slot", minLength: 1 })
	@IsOptional()
	@IsString()
	@MinLength(1)
	venue?: string;
}
