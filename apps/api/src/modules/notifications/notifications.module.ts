import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { PrismaModule } from "prisma/prisma.module";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";

@Module({
	imports: [
		ConfigModule,
		PrismaModule,
		BullModule.registerQueueAsync({
			name: "notification",
			imports: [ConfigModule],
			inject: [ConfigService],
			useFactory: (config: ConfigService) => ({
				connection: {
					url: config.getOrThrow<string>("REDIS_URL"),
				},
				defaultJobOptions: {
					attempts: 3,
					backoff: { type: "exponential", delay: 5_000 },
					removeOnComplete: { count: 500 },
					removeOnFail: { count: 100 },
				},
			}),
		}),
	],
	controllers: [NotificationsController],
	providers: [NotificationsService],
	exports: [NotificationsService],
})
export class NotificationsModule {}
