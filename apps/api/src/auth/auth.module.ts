import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PassportModule } from "@nestjs/passport";
import { AllowlistModule } from "./allowlist/allowlist.module";
import { AllowlistService } from "./allowlist/allowlist.service";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { GoogleStrategy } from "./strategies/google.strategy";

@Module({
	imports: [
		ConfigModule,
		PassportModule.register({ session: false }),
		AllowlistModule,
	],
	controllers: [AuthController],
	providers: [AuthService, GoogleStrategy, AllowlistService],
})
export class AuthModule {}
