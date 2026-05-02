import { HealthService } from "./health.service";

describe("HealthService", () => {
	let service: HealthService;
	let mockPrisma: any;
	let mockRedisClient: any;

	beforeEach(() => {
		mockPrisma = {
			$queryRaw: jest.fn(),
		} as any;

		mockRedisClient = {
			isOpen: true,
			ping: jest.fn(),
		} as any;

		jest.clearAllMocks();
	});

	describe("getHealth", () => {
		it("returns ok when database is up and redis is up", async () => {
			mockPrisma.$queryRaw.mockResolvedValue([{ "1": 1 }]);
			mockRedisClient.ping.mockResolvedValue("PONG");

			service = new HealthService(mockPrisma, mockRedisClient);

			const result = await service.getHealth();

			expect(result.status).toBe("ok");
			expect(result.dependencies.database).toBe("up");
			expect(result.dependencies.redis).toBe("up");
			expect(result.timestamp).toBeDefined();
			expect(result.uptimeSeconds).toBeDefined();
		});

		it("returns ok when database is up and redis is not configured", async () => {
			mockPrisma.$queryRaw.mockResolvedValue([{ "1": 1 }]);

			service = new HealthService(mockPrisma, undefined);

			const result = await service.getHealth();

			expect(result.status).toBe("ok");
			expect(result.dependencies.database).toBe("up");
			expect(result.dependencies.redis).toBe("not-configured");
		});

		it("returns error when database is up but redis is down", async () => {
			mockPrisma.$queryRaw.mockResolvedValue([{ "1": 1 }]);
			mockRedisClient.isOpen = false;

			service = new HealthService(mockPrisma, mockRedisClient);

			const result = await service.getHealth();

			expect(result.status).toBe("error");
			expect(result.dependencies.database).toBe("up");
			expect(result.dependencies.redis).toBe("down");
		});

		it("returns error when database is down", async () => {
			mockPrisma.$queryRaw.mockRejectedValue(new Error("DB down"));

			service = new HealthService(mockPrisma, undefined);

			const result = await service.getHealth();

			expect(result.status).toBe("error");
			expect(result.dependencies.database).toBe("down");
		});

		it("returns error when database is down and redis is up", async () => {
			mockPrisma.$queryRaw.mockRejectedValue(new Error("DB down"));
			mockRedisClient.ping.mockResolvedValue("PONG");

			service = new HealthService(mockPrisma, mockRedisClient);

			const result = await service.getHealth();

			expect(result.status).toBe("error");
			expect(result.dependencies.database).toBe("down");
			expect(result.dependencies.redis).toBe("up");
		});
	});

	describe("checkDatabase", () => {
		it("returns up when query succeeds", async () => {
			mockPrisma.$queryRaw.mockResolvedValue([{ "1": 1 }]);

			service = new HealthService(mockPrisma, undefined);
			const checkDatabase = (service as any).checkDatabase.bind(service);

			const result = await checkDatabase();
			expect(result).toBe("up");
		});

		it("returns down when query fails", async () => {
			mockPrisma.$queryRaw.mockRejectedValue(new Error("connection failed"));

			service = new HealthService(mockPrisma, undefined);
			const checkDatabase = (service as any).checkDatabase.bind(service);

			const result = await checkDatabase();
			expect(result).toBe("down");
		});
	});

	describe("checkRedis", () => {
		it("returns not-configured when redis client is not provided", async () => {
			service = new HealthService(mockPrisma, undefined);
			const checkRedis = (service as any).checkRedis.bind(service);

			const result = await checkRedis();
			expect(result).toBe("not-configured");
		});

		it("returns down when redis client is not open", async () => {
			mockRedisClient.isOpen = false;

			service = new HealthService(mockPrisma, mockRedisClient);
			const checkRedis = (service as any).checkRedis.bind(service);

			const result = await checkRedis();
			expect(result).toBe("down");
		});

		it("returns up when redis ping succeeds", async () => {
			mockRedisClient.isOpen = true;
			mockRedisClient.ping.mockResolvedValue("PONG");

			service = new HealthService(mockPrisma, mockRedisClient);
			const checkRedis = (service as any).checkRedis.bind(service);

			const result = await checkRedis();
			expect(result).toBe("up");
		});

		it("returns down when redis ping fails", async () => {
			mockRedisClient.isOpen = true;
			mockRedisClient.ping.mockRejectedValue(new Error("ping failed"));

			service = new HealthService(mockPrisma, mockRedisClient);
			const checkRedis = (service as any).checkRedis.bind(service);

			const result = await checkRedis();
			expect(result).toBe("down");
		});
	});
});
