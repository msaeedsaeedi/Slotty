import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "prisma/prisma.service";
import { CreateAuditEventDto } from "./dto/create-audit-event.dto";

@Injectable()
export class AuditService {
	constructor(private readonly prisma: PrismaService) {}

	async append(dto: CreateAuditEventDto): Promise<void> {
		await this.prisma.auditEvent.create({
			data: {
				actorId: dto.actorId,
				entityType: dto.entityType,
				entityId: dto.entityId,
				eventType: dto.eventType,
				payload: (dto.payload ?? {}) as Prisma.InputJsonValue,
			},
		});
	}
}
