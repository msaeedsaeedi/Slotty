import { Global, Module } from "@nestjs/common";
import { ConfigModule as NestConfigModule } from "@nestjs/config";
import { configuration } from "./configuration";
import { validationSchema } from "./validation.schema";

@Global()
@Module({
	imports: [
		NestConfigModule.forRoot({
			load: [configuration],
			validationSchema,
			validationOptions: {
				allowUnknown: true,
				abortEarly: false,
			},
			isGlobal: true,
			cache: true,
		}),
	],
	exports: [NestConfigModule],
})
export class AppConfigModule {}
