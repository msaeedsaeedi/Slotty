import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsString, IsUrl, ValidateNested } from "class-validator";

class PushSubscriptionKeysDto {
	@ApiProperty({
		description: "P-256 Diffie-Hellman key from push subscription",
	})
	@IsString()
	p256dh!: string;

	@ApiProperty({ description: "Auth secret from push subscription" })
	@IsString()
	auth!: string;
}

export class PushSubscribeDto {
	/** The push service endpoint URL provided by the browser. */
	@ApiProperty({ description: "Push service endpoint URL" })
	@IsUrl()
	endpoint!: string;

	@ApiProperty({
		description: "Push subscription keys (p256dh and auth)",
		type: () => PushSubscriptionKeysDto,
	})
	@ValidateNested()
	@Type(() => PushSubscriptionKeysDto)
	keys!: PushSubscriptionKeysDto;
}
