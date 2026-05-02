import { AllowedListType } from "@prisma/client";
import { IsEnum, IsString, MinLength } from "class-validator";

export class CreateAllowlistEntryDto {
	@IsEnum(["domain", "email"])
	type!: AllowedListType;

	@IsString()
	@MinLength(3)
	value!: string;
}
