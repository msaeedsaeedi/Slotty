import { IsObject, IsOptional, IsString } from "class-validator";

export class CreateAuditEventDto {
	@IsString()
	actorId!: string;

	@IsString()
	entityType!: string;

	@IsString()
	entityId!: string;

	@IsString()
	eventType!: string;

	@IsOptional()
	@IsObject()
	payload?: Record<string, unknown>;
}
