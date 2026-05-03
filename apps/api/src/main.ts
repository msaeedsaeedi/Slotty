import "dotenv/config";
import { Logger, ValidationPipe, VersioningType } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import compression from "compression";
import { RedisStore } from "connect-redis";
import cookieParser from "cookie-parser";
import session from "express-session";
import helmet from "helmet";
import { RedisClientType } from "redis";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";

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

	// Global exception filter for standardized error responses
	app.useGlobalFilters(new AllExceptionsFilter());

	// CORS configuration
	const corsOrigin = configService.get<string>("webapp.origin");
	app.enableCors({
		origin: corsOrigin,
		credentials: true,
	});

	// Session configuration for passport
	const sessionName = configService.getOrThrow<string>("session.name");
	const sessionSecret = configService.getOrThrow<string>("session.secret");
	const sessionTtlHours = configService.getOrThrow<number>("session.ttlHours");

	const redisClient = app.get<RedisClientType>("REDIS_CLIENT");
	const redisStore = new RedisStore({ client: redisClient });

	app.use(
		session({
			name: sessionName,
			secret: sessionSecret,
			store: redisStore,
			resave: false,
			saveUninitialized: false,
			cookie: {
				maxAge: sessionTtlHours * 60 * 60 * 1000,
				httpOnly: true,
				sameSite: "strict",
				secure: process.env.NODE_ENV === "production",
			},
		}),
	);

	// Graceful shutdown
	app.enableShutdownHooks();

	// OpenAPI 3.1 documentation
	const config = new DocumentBuilder()
		.setTitle("Slotty API")
		.setDescription("API documentation for Slotty slot booking system")
		.setVersion("1.0")
		.addCookieAuth(sessionName, {
			type: "apiKey",
			in: "cookie",
			name: sessionName,
		})
		.build();
	const document = SwaggerModule.createDocument(app, config, {
		extraModels: [],
	});
	SwaggerModule.setup("api/docs", app, document, {
		jsonDocumentUrl: "api/docs-json",
		yamlDocumentUrl: "api/docs-yaml",
	});

	const port = configService.getOrThrow<number>("port");
	await app.listen(port);

	logger.log(`Application running on: http://localhost:${port}`);
	logger.log(`Environment: ${configService.get<string>("env")}`);
	logger.log(`CORS enabled for: ${corsOrigin}`);
	logger.log(`API docs available at: http://localhost:${port}/api/docs`);
}

void bootstrap();
