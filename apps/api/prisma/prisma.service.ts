import {
	Injectable,
	Logger,
	OnModuleDestroy,
	OnModuleInit,
} from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

interface PrismaQueryEvent {
	timestamp: Date;
	duration: number;
	query: string;
	params: string;
	target: string;
}

@Injectable()
export class PrismaService
	extends PrismaClient
	implements OnModuleInit, OnModuleDestroy
{
	private readonly logger = new Logger(PrismaService.name);

	constructor() {
		const pool = new Pool({ connectionString: process.env["DATABASE_URL"] });
		const adapter = new PrismaPg(pool);
		super({
			adapter,
			log: [
				{ emit: "event", level: "query" },
				{ emit: "event", level: "error" },
				{ emit: "event", level: "warn" },
			],
		});
	}

	async onModuleInit() {
		await this.$connect();
		this.logger.log("Connected to the database");

		this.$on("query" as never, (e: PrismaQueryEvent) => {
			this.logger.debug(
				`\nQuery: ${e.query}\nParams: ${e.params}\nDuration: ${e.duration}ms`,
			);
		});
	}

	async onModuleDestroy() {
		await this.$disconnect();
	}
}
