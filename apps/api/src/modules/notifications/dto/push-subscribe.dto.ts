import { Type } from "class-transformer";
import { IsString, IsUrl, ValidateNested } from "class-validator";

class PushSubscriptionKeysDto {
	@IsString()
	p256dh!: string;

	@IsString()
	auth!: string;
}

export class PushSubscribeDto {
	/** The push service endpoint URL provided by the browser. */
	@IsUrl()
	endpoint!: string;

	@ValidateNested()
	@Type(() => PushSubscriptionKeysDto)
	keys!: PushSubscriptionKeysDto;
}
