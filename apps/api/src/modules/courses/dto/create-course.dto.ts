import { IsString, MinLength } from "class-validator";

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

	@IsString()
	@MinLength(1)
	owner_id!: string;
}
