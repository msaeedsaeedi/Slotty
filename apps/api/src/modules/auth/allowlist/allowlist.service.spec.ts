import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "prisma/prisma.service";
import { NotFoundException } from "@/common/exceptions/business.exception";
import { AllowlistService } from "./allowlist.service";
import { CreateAllowlistEntryDto } from "./dto/create-allowlist-entry.dto";

describe("AllowlistService", () => {
	let service: AllowlistService;
	let mockPrisma: any;

	beforeEach(async () => {
		mockPrisma = {
			allowedList: {
				findMany: jest.fn(),
				findFirst: jest.fn(),
				create: jest.fn(),
				findUnique: jest.fn(),
				delete: jest.fn(),
			},
		};

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				AllowlistService,
				{ provide: PrismaService, useValue: mockPrisma },
			],
		}).compile();

		service = module.get<AllowlistService>(AllowlistService);
	});

	it("listEntries returns entries", async () => {
		const entries = [{ id: "id1" }];
		mockPrisma.allowedList.findMany.mockResolvedValue(entries as any);
		const res = await service.listEntries();
		expect(res).toEqual(entries);
	});

	it("isAllowed returns true when match found and false when none", async () => {
		mockPrisma.allowedList.findFirst.mockResolvedValue({ id: "m" } as any);
		const yes = await service.isAllowed("user@example.com");
		expect(yes).toBe(true);

		mockPrisma.allowedList.findFirst.mockResolvedValue(null);
		const no = await service.isAllowed("user@domain.invalid");
		expect(no).toBe(false);
	});

	it("addEntry creates a new allowlist entry", async () => {
		const dto: CreateAllowlistEntryDto = {
			type: "domain",
			value: "example.com",
		} as any;
		mockPrisma.allowedList.create.mockResolvedValue({ id: "new" } as any);
		const res = await service.addEntry(dto);
		expect(res).toEqual({ id: "new" } as any);
		expect(mockPrisma.allowedList.create).toHaveBeenCalledWith({
			data: { type: dto.type, value: dto.value },
		});
	});

	it("removeEntry returns entry when found", async () => {
		mockPrisma.allowedList.findUnique.mockResolvedValue({ id: "del" } as any);
		mockPrisma.allowedList.delete.mockResolvedValue({ id: "del" } as any);
		const res = await service.removeEntry("del");
		expect(res).toEqual({ id: "del" } as any);
	});

	it("removeEntry throws NotFoundException when not found", async () => {
		mockPrisma.allowedList.findUnique.mockResolvedValue(null);
		await expect(service.removeEntry("missing")).rejects.toBeInstanceOf(
			NotFoundException,
		);
	});
});
