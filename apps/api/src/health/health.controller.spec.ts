import { ServiceUnavailableException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";

describe("HealthController", () => {
	let controller: HealthController;
	let mockHealthService: any;

	beforeEach(async () => {
		mockHealthService = {
			getHealth: jest.fn(),
		};

		const module: TestingModule = await Test.createTestingModule({
			controllers: [HealthController],
			providers: [{ provide: HealthService, useValue: mockHealthService }],
		}).compile();

		controller = module.get<HealthController>(HealthController);
	});

	it("getHealth returns health data when status is ok", async () => {
		const health = {
			status: "ok",
			timestamp: new Date().toISOString(),
			uptimeSeconds: 1,
			dependencies: { database: "up", redis: "not-configured" },
		} as any;
		mockHealthService.getHealth.mockResolvedValue(health);

		const result = await controller.getHealth();
		expect(result).toEqual(health);
	});

	it("getHealth throws when status is error", async () => {
		const health = {
			status: "error",
		} as any;
		mockHealthService.getHealth.mockResolvedValue(health);

		await expect(controller.getHealth()).rejects.toBeInstanceOf(
			ServiceUnavailableException,
		);
	});
});
