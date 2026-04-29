import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { buildDataSourceOptions } from "./database.config.js";

@Module({
	imports: [
		TypeOrmModule.forRootAsync({
			inject: [ConfigService],
			useFactory: (config: ConfigService) => {
				const databaseUrl = config.get<string>("DATABASE_URL");
				if (!databaseUrl) {
					throw new Error("DATABASE_URL is required for database setup.");
				}
				return buildDataSourceOptions(databaseUrl);
			},
		}),
	],
})
export class DatabaseModule {}
