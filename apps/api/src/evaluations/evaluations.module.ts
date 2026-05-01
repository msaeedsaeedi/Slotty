// src/modules/evaluations/evaluations.module.ts

import { Module } from "@nestjs/common";
import { PrismaModule } from "prisma/prisma.module";
import { AuditModule } from "@/audit/audit.module";
import { RedisModule } from "@/common/redis/redis.module";
import { EvaluationsController } from "./evaluations.controller";
import { EvaluationsService } from "./evaluations.service";

/**
 * EvaluationsModule
 *
 * Owns the full evaluation lifecycle:
 *   create → update → submit batch → instructor review
 *
 */
@Module({
	imports: [PrismaModule, RedisModule, AuditModule],
	controllers: [EvaluationsController],
	providers: [EvaluationsService],
	exports: [EvaluationsService],
})
export class EvaluationsModule {}
