import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsString } from "class-validator";

export class BulkEnrollmentRowDto {
	@ApiProperty({
		description: "Email address of the user to enroll",
		example: "student@university.edu",
	})
	@IsString()
	email!: string;

	@ApiProperty({ description: "Role in the course", enum: ["student", "ta"] })
	@IsIn(["student", "ta"])
	role_in_course!: "student" | "ta";
}
