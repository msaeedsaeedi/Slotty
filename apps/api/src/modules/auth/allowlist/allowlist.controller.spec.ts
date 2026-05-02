import { Test, TestingModule } from "@nestjs/testing";
import { AllowlistController } from "./allowlist.controller";
import { AllowlistService } from "./allowlist.service";
import { CreateAllowlistEntryDto } from "./dto/create-allowlist-entry.dto";

describe("AllowlistController", () => {
	let controller: AllowlistController;
	let mockService: any;

	beforeEach(async () => {
		mockService = {
			listEntries: jest.fn(),
			addEntry: jest.fn(),
			removeEntry: jest.fn(),
		};

		const module: TestingModule = await Test.createTestingModule({
			controllers: [AllowlistController],
			providers: [{ provide: AllowlistService, useValue: mockService }],
		}).compile();

		controller = module.get<AllowlistController>(AllowlistController);
	});

	it("listEntries returns entries", async () => {
		const entries = [{ id: "e1" }];
		mockService.listEntries.mockResolvedValue(entries as any);
		const res = await controller.listEntries();
		expect(res).toEqual({ entries });
	});

	it("createEntry returns created entry", async () => {
		const dto: CreateAllowlistEntryDto = {
			type: "email",
			value: "test@example.com",
		} as any;
		const entry = { id: "e2" } as any;
		mockService.addEntry.mockResolvedValue(entry);
		const res = await controller.createEntry(dto);
		expect(res).toEqual({ entry });
	});

	it("deleteEntry returns deleted entry", async () => {
		const entry = { id: "e3" } as any;
		mockService.removeEntry.mockResolvedValue(entry);
		const res = await controller.deleteEntry("e3" as any);
		expect(res).toEqual({ entry });
	});
});
