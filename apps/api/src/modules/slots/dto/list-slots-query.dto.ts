import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString } from "class-validator";

const slotStatuses = [
	"draft",
	"published",
	"booked",
	"completed",
	"cancelled",
] as const;

export class ListSlotsQueryDto {
	@ApiPropertyOptional({
		description: "Filter slots by status",
		enum: ["draft", "published", "booked", "completed", "cancelled"],
	})
	@IsOptional()
	@IsIn(slotStatuses)
	status?: (typeof slotStatuses)[number];

	@ApiPropertyOptional({ description: "Filter slots by date (YYYY-MM-DD)" })
	@IsOptional()
	@IsString()
	date?: string;
}
