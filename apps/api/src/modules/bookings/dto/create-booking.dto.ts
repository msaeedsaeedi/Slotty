import { IsUUID } from "class-validator";

export class CreateBookingDto {
	@IsUUID()
	slot_id!: string;
}
