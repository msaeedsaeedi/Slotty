import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module.js";

const port = Number.parseInt(process.env.PORT ?? "3001", 10);

async function bootstrap() {
	const app = await NestFactory.create(AppModule);
	app.setGlobalPrefix("api/v1");
	app.enableCors({
		origin: ["http://localhost:3000"],
		credentials: true,
	});
	app.useGlobalPipes(
		new ValidationPipe({
			whitelist: true,
			forbidNonWhitelisted: true,
			transform: true,
			transformOptions: { enableImplicitConversion: true },
		}),
	);

	if (process.env.ENABLE_SWAGGER === "true") {
		const config = new DocumentBuilder()
			.setTitle("Slotty API")
			.setDescription("Slotty API documentation")
			.setVersion(process.env.APP_VERSION ?? "dev")
			.build();
		const document = SwaggerModule.createDocument(app, config);
		SwaggerModule.setup("api/docs", app, document);
	}

	await app.listen(port);
}

bootstrap();
