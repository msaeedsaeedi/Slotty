import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsString, MinLength } from "class-validator";

export class CreateEnrollmentDto {
	@ApiProperty({ description: "User ID to enroll in the course", minLength: 1 })
	@IsString()
	@MinLength(1)
	user_id!: string;

	@ApiProperty({ description: "Role in the course", enum: ["student", "ta"] })
	@IsIn(["student", "ta"])
	role_in_course!: "student" | "ta";
}
