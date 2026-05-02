import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "prisma/prisma.service";
import { AuditService } from "./audit.service";
import { CreateAuditEventDto } from "./dto/create-audit-event.dto";

describe("AuditService", () => {
	let service: AuditService;
	let mockPrisma: any;

	beforeEach(async () => {
		mockPrisma = { auditEvent: { create: jest.fn() } };
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				AuditService,
				{ provide: PrismaService, useValue: mockPrisma },
			],
		}).compile();

		service = module.get<AuditService>(AuditService);
	});

	it("append should call prisma.auditEvent.create with mapped payload", async () => {
		const dto: CreateAuditEventDto = {
			actorId: "actor-1",
			entityType: "entity",
			entityId: "entity-1",
			eventType: "created",
			payload: { hello: "world" },
		} as any;

		await service.append(dto);

		expect(mockPrisma.auditEvent.create).toHaveBeenCalled();
		const arg = mockPrisma.auditEvent.create.mock.calls[0][0];
		expect(arg).toEqual({
			data: {
				actorId: dto.actorId,
				entityType: dto.entityType,
				entityId: dto.entityId,
				eventType: dto.eventType,
				payload: dto.payload,
			},
		});
	});

	it("append should use empty payload when payload is undefined", async () => {
		const dto: CreateAuditEventDto = {
			actorId: "actor-2",
			entityType: "entity",
			entityId: "entity-2",
			eventType: "updated",
		} as any;

		await service.append(dto);

		const arg =
			mockPrisma.auditEvent.create.mock.calls[
				mockPrisma.auditEvent.create.mock.calls.length - 1
			][0];
		expect(arg.data.payload).toEqual({});
	});
});
