import { IsIn, IsOptional, IsString } from "class-validator";

const slotStatuses = [
	"draft",
	"published",
	"booked",
	"completed",
	"cancelled",
] as const;

export class ListSlotsQueryDto {
	@IsOptional()
	@IsIn(slotStatuses)
	status?: (typeof slotStatuses)[number];

	@IsOptional()
	@IsString()
	date?: string;
}
