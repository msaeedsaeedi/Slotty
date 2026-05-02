import {
	IsEmail,
	IsIn,
	IsOptional,
	IsString,
	MinLength,
} from "class-validator";

const userRoles = ["student", "ta", "instructor", "admin"] as const;

export class CreateUserDto {
	@IsString()
	@MinLength(1)
	name!: string;

	@IsEmail()
	email!: string;

	@IsIn(userRoles)
	role!: (typeof userRoles)[number];

	@IsOptional()
	@IsString()
	roll_number?: string;

	@IsOptional()
	@IsIn(["active", "pending_verification", "disabled"])
	status?: "active" | "pending_verification" | "disabled";
}
