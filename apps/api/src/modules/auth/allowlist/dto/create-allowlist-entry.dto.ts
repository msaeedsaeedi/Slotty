import { ApiProperty } from "@nestjs/swagger";
import { AllowedListType } from "@repo/database";
import { IsEnum, IsString, MinLength } from "class-validator";

export class CreateAllowlistEntryDto {
	@ApiProperty({
		description: "Type of allowlist entry",
		enum: ["domain", "email"],
	})
	@IsEnum(["domain", "email"])
	type!: AllowedListType;

	@ApiProperty({
		description: "Domain (e.g. 'university.edu') or email address",
		minLength: 3,
	})
	@IsString()
	@MinLength(3)
	value!: string;
}
