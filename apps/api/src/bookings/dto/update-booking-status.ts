import { IsEnum } from "class-validator";

export class UpdateBookingStatusDto {
	@IsEnum(["completed", "no_show"])
	status!: "completed" | "no_show";
}
