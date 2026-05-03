import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
	IsEmail,
	IsIn,
	IsOptional,
	IsString,
	MinLength,
} from "class-validator";

const userRoles = ["student", "ta", "instructor", "admin"] as const;

export class CreateUserDto {
	@ApiProperty({ description: "Full name of the user", minLength: 1 })
	@IsString()
	@MinLength(1)
	name!: string;

	@ApiProperty({ description: "Email address of the user" })
	@IsEmail()
	email!: string;

	@ApiProperty({
		description: "Role assigned to the user",
		enum: ["student", "ta", "instructor", "admin"],
	})
	@IsIn(userRoles)
	role!: (typeof userRoles)[number];

	@ApiPropertyOptional({ description: "Student roll number (for students)" })
	@IsOptional()
	@IsString()
	roll_number?: string;

	@ApiPropertyOptional({
		description: "Account status",
		enum: ["active", "pending_verification", "disabled"],
		default: "pending_verification",
	})
	@IsOptional()
	@IsIn(["active", "pending_verification", "disabled"])
	status?: "active" | "pending_verification" | "disabled";
}
