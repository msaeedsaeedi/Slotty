import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsUUID, MinLength } from "class-validator";

export class CreateCourseDto {
	@ApiProperty({ description: "Course code (e.g. CS101)", minLength: 1 })
	@IsString()
	@MinLength(1)
	code!: string;

	@ApiProperty({ description: "Course title", minLength: 1 })
	@IsString()
	@MinLength(1)
	title!: string;

	@ApiProperty({ description: "Academic term (e.g. Fall 2024)", minLength: 1 })
	@IsString()
	@MinLength(1)
	term!: string;

	@ApiProperty({
		description: "UUID of the instructor who owns this course",
		format: "uuid",
	})
	@IsUUID("4")
	owner_id!: string;
}
