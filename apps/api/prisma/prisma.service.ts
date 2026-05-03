import {
	Injectable,
	Logger,
	OnModuleDestroy,
	OnModuleInit,
} from "@nestjs/common";

import { BasePrismaClient } from "@repo/database";

@Injectable()
export class PrismaService
	extends BasePrismaClient
	implements OnModuleInit, OnModuleDestroy
{
	private readonly logger = new Logger(PrismaService.name);

	async onModuleInit() {
		await this.$connect();
		this.logger.log("Connected to the database");
	}

	async onModuleDestroy() {
		await this.$disconnect();
	}
}
