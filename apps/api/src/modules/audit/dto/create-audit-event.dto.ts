import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsObject, IsOptional, IsString } from "class-validator";

export class CreateAuditEventDto {
	@ApiProperty({ description: "ID of the user who performed the action" })
	@IsString()
	actorId!: string;

	@ApiProperty({
		description: "Type of entity being acted on (e.g. 'booking', 'slot')",
	})
	@IsString()
	entityType!: string;

	@ApiProperty({ description: "ID of the entity being acted on" })
	@IsString()
	entityId!: string;

	@ApiProperty({
		description: "Type of event (e.g. 'created', 'updated', 'deleted')",
	})
	@IsString()
	eventType!: string;

	@ApiPropertyOptional({ description: "Additional event payload" })
	@IsOptional()
	@IsObject()
	payload?: Record<string, unknown>;
}
