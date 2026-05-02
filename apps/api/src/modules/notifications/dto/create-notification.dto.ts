import { NotificationType } from "@prisma/client";
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
	@IsUUID()
	userId!: string;

	@IsString()
	@IsIn(VALID_TYPES)
	type!: NotificationType;

	@IsString()
	title!: string;

	@IsString()
	body!: string;

	@IsOptional()
	@IsObject()
	data?: Record<string, unknown>;

	@IsOptional()
	@IsArray()
	@IsIn(VALID_CHANNELS, { each: true })
	channels?: NotificationChannel[];
}
