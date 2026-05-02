import { IsIn, IsString, MinLength } from "class-validator";

export class CreateEnrollmentDto {
	@IsString()
	@MinLength(1)
	user_id!: string;

	@IsIn(["student", "ta"])
	role_in_course!: "student" | "ta";
}
