import { Inject, Injectable, Optional } from "@nestjs/common";
import { PrismaService } from "prisma/prisma.service";
import type { RedisClientType } from "redis";
import { REDIS_CLIENT } from "@/common/redis/redis.module";

type DependencyStatus = "up" | "down" | "not-configured";
type OverallStatus = "ok" | "error";

export interface HealthResponse {
	status: OverallStatus;
	timestamp: string;
	uptimeSeconds: number;
	dependencies: {
		database: DependencyStatus;
		redis: DependencyStatus;
	};
}

@Injectable()
export class HealthService {
	constructor(
		private readonly prisma: PrismaService,
		@Optional()
		@Inject(REDIS_CLIENT)
		private readonly redisClient?: RedisClientType,
	) {}

	async getHealth(): Promise<HealthResponse> {
		const [databaseStatus, redisStatus] = await Promise.all([
			this.checkDatabase(),
			this.checkRedis(),
		]);

		const status: OverallStatus =
			databaseStatus === "up" &&
			(redisStatus === "up" || redisStatus === "not-configured")
				? "ok"
				: "error";

		return {
			status,
			timestamp: new Date().toISOString(),
			uptimeSeconds: Math.floor(process.uptime()),
			dependencies: {
				database: databaseStatus,
				redis: redisStatus,
			},
		};
	}

	private async checkDatabase(): Promise<DependencyStatus> {
		try {
			await this.prisma.$queryRaw`SELECT 1`;
			return "up";
		} catch {
			return "down";
		}
	}

	private async checkRedis(): Promise<DependencyStatus> {
		if (!this.redisClient) {
			return "not-configured";
		}

		if (!this.redisClient.isOpen) {
			return "down";
		}

		try {
			await this.redisClient.ping();
			return "up";
		} catch {
			return "down";
		}
	}
}
