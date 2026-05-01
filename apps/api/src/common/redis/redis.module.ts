import { Global, Logger, Module, OnApplicationShutdown } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ModuleRef } from "@nestjs/core";
import { createClient, RedisClientType } from "redis";

export const REDIS_CLIENT = "REDIS_CLIENT";

@Global()
@Module({
	imports: [ConfigModule],
	providers: [
		{
			provide: REDIS_CLIENT,
			useFactory: async (cfg: ConfigService): Promise<RedisClientType> => {
				const logger = new Logger("RedisClient");

				const client: RedisClientType = createClient({
					url: cfg.get<string>("redis.url"),
					socket: {
						reconnectStrategy: (retries) => {
							const delay = Math.min(retries * 50, 2000);
							logger.warn(`Redis retry attempt ${retries}, waiting ${delay}ms`);
							return delay;
						},
					},
				});

				client.on("error", (err: Error) => {
					logger.error("Redis error: " + err.message);
				});

				client.on("connect", () => {
					logger.log("Redis connected");
				});

				client.on("reconnecting", () => {
					logger.warn("Redis reconnecting...");
				});

				await client.connect();

				return client;
			},
			inject: [ConfigService],
		},
	],
	exports: [REDIS_CLIENT],
})
export class RedisModule implements OnApplicationShutdown {
	constructor(private readonly moduleRef: ModuleRef) {}

	async onApplicationShutdown() {
		const logger = new Logger(RedisModule.name);
		const client = this.moduleRef.get<RedisClientType>(REDIS_CLIENT);

		if (client?.isOpen) {
			logger.log("Closing Redis connection...");
			await client.quit();
		}
	}
}
