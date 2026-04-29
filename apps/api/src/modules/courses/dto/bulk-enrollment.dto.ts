import { IsString, MinLength } from "class-validator";

export class BulkEnrollmentDto {
	@IsString()
	@MinLength(1)
	csv_data!: string;
}
