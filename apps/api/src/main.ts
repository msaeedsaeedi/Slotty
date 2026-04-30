import "dotenv/config";
import { Logger, ValidationPipe, VersioningType } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import compression from "compression";
import cookieParser from "cookie-parser";
import helmet from "helmet";

import { AppModule } from "./app.module";

async function bootstrap() {
	const app = await NestFactory.create(AppModule, {
		logger: ["error", "warn", "log", "debug", "verbose"],
	});

	app.enableVersioning({
		type: VersioningType.URI,
	});

	const configService = app.get(ConfigService);
	const logger = new Logger("Bootstrap");

	// Security middleware
	app.use(helmet());
	app.use(compression());
	app.use(cookieParser());

	// Global validation pipe
	app.useGlobalPipes(
		new ValidationPipe({
			whitelist: true,
			forbidNonWhitelisted: true,
			transform: true,
			transformOptions: {
				enableImplicitConversion: true,
			},
		}),
	);

	// CORS configuration
	const corsOrigin = configService.get<string>("cors.origin");
	app.enableCors({
		origin: corsOrigin,
		credentials: true,
	});

	// Graceful shutdown
	app.enableShutdownHooks();

	const port = configService.getOrThrow<number>("port");
	await app.listen(port);

	logger.log(`Application running on: http://localhost:${port}`);
	logger.log(`Environment: ${configService.get<string>("env")}`);
	logger.log(`CORS enabled for: ${corsOrigin}`);
}

void bootstrap();
