import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { NotificationType } from "@repo/database";
import {
	IsArray,
	IsIn,
	IsObject,
	IsOptional,
	IsString,
	IsUUID,
} from "class-validator";
import {
	type NotificationChannel,
	VALID_CHANNELS,
} from "../notifications.service";

const VALID_TYPES: NotificationType[] = Object.values(NotificationType);

export class CreateNotificationDto {
	/** UUID of the user who should receive the notification. */
	@ApiProperty({ description: "UUID of the user to notify", format: "uuid" })
	@IsUUID()
	userId!: string;

	@ApiProperty({
		description: "Type of notification",
		enum: Object.values(NotificationType),
	})
	@IsString()
	@IsIn(VALID_TYPES)
	type!: NotificationType;

	@ApiProperty({ description: "Notification title" })
	@IsString()
	title!: string;

	@ApiProperty({ description: "Notification body text" })
	@IsString()
	body!: string;

	@ApiPropertyOptional({
		description: "Additional structured data for the notification",
	})
	@IsOptional()
	@IsObject()
	data?: Record<string, unknown>;

	@ApiPropertyOptional({
		description: "Channels to deliver through (defaults to all configured)",
		enum: VALID_CHANNELS,
		isArray: true,
	})
	@IsOptional()
	@IsArray()
	@IsIn(VALID_CHANNELS, { each: true })
	channels?: NotificationChannel[];
}
