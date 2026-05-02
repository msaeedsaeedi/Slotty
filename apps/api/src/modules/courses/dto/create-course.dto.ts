import { IsString, IsUUID, MinLength } from "class-validator";

export class CreateCourseDto {
	@IsString()
	@MinLength(1)
	code!: string;

	@IsString()
	@MinLength(1)
	title!: string;

	@IsString()
	@MinLength(1)
	term!: string;

	@IsUUID("4")
	owner_id!: string;
}
