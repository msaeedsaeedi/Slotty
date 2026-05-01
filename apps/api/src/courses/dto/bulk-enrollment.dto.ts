import { IsIn, IsString } from "class-validator";

export class BulkEnrollmentRowDto {
	@IsString()
	email!: string;

	@IsIn(["student", "ta"])
	role_in_course!: "student" | "ta";
}
