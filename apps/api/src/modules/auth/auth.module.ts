import { Module, Provider } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { PassportModule } from "@nestjs/passport";
import { UsersModule } from "@/modules/users/users.module";
import { UsersService } from "../users/users.service";
import { AllowlistModule } from "./allowlist/allowlist.module";
import { AllowlistService } from "./allowlist/allowlist.service";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { RolesGuard } from "./guards/roles.guard";
import { SessionGuard } from "./guards/session.guard";
import { GoogleStrategy } from "./strategies/google.strategy";

const guards: Provider[] = [
	{
		provide: APP_GUARD,
		useClass: SessionGuard,
	},
	{
		provide: APP_GUARD,
		useClass: RolesGuard,
	},
];

@Module({
	imports: [
		ConfigModule,
		PassportModule.register({ session: false }),
		UsersModule,
		AllowlistModule,
	],
	controllers: [AuthController],
	providers: [
		...guards,
		AuthService,
		GoogleStrategy,
		AllowlistService,
		UsersService,
	],
})
export class AuthModule {}
