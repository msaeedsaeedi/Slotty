import { IsUUID } from "class-validator";

export class GenerateSlotsDto {
	@IsUUID()
	ta_id!: string;
}
