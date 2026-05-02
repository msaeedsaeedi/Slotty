import { Test, TestingModule } from "@nestjs/testing";
import {
	createMockAssignment,
	createMockSlot,
	createMockUser,
} from "@test/utils/factories";
import { PrismaService } from "prisma/prisma.service";
import {
	ConflictException,
	ForbiddenException,
	NotFoundException,
} from "@/common/exceptions/business.exception";
import { AuditService } from "@/modules/audit/audit.service";
import { BookingsService } from "./bookings.service";

describe("BookingsService", () => {
	let service: BookingsService;
	// biome-ignore lint/correctness/noUnusedVariables: <False positive - used in transaction callback>
	let auditService: jest.Mocked<AuditService>;

	// Mock transaction callback
	// biome-ignore lint/correctness/noUnusedVariables: <False positive - used in transaction callback>
	let transactionCallback: any;

	const mockTx = {
		$queryRaw: jest.fn(),
		booking: {
			findFirst: jest.fn(),
			findUnique: jest.fn(),
			count: jest.fn(),
			create: jest.fn(),
			update: jest.fn(),
		},
		demoSlot: {
			findUnique: jest.fn(),
			update: jest.fn(),
		},
		assignment: {
			findUnique: jest.fn(),
		},
		enrollment: {
			findFirst: jest.fn(),
		},
	};

	const mockPrismaService = {
		$transaction: jest.fn((callback) => {
			transactionCallback = callback;
			return callback(mockTx);
		}),
		booking: {
			findUnique: jest.fn(),
			findMany: jest.fn(),
		},
		demoSlot: {
			findUnique: jest.fn(),
		},
	};

	const mockAuditService = {
		append: jest.fn().mockResolvedValue(undefined),
	};

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				BookingsService,
				{
					provide: PrismaService,
					useValue: mockPrismaService,
				},
				{
					provide: AuditService,
					useValue: mockAuditService,
				},
			],
		}).compile();

		service = module.get<BookingsService>(BookingsService);
		auditService = module.get(AuditService) as jest.Mocked<AuditService>;

		jest.clearAllMocks();
	});

	describe("createBooking", () => {
		it("should throw NotFoundException when slot not found", async () => {
			mockTx.$queryRaw.mockResolvedValue([]);

			const actor = createMockUser({ role: "admin" });
			const dto = { slot_id: "non-existent-slot" };

			await expect(service.createBooking(actor, dto)).rejects.toThrow(
				NotFoundException,
			);
		});

		it("should throw ConflictException when slot is not published", async () => {
			const slot = createMockSlot({ status: "booked" });
			const assignment = createMockAssignment();
			mockTx.$queryRaw.mockResolvedValue([{ ...slot, assignment }]);

			const actor = createMockUser({ role: "admin" });
			const dto = { slot_id: slot.id };

			await expect(service.createBooking(actor, dto)).rejects.toThrow(
				ConflictException,
			);
		});

		it("should throw ConflictException when slot is full", async () => {
			const slot = createMockSlot({ capacity: 1, status: "published" });
			const assignment = createMockAssignment();

			mockTx.$queryRaw.mockResolvedValue([{ ...slot, assignment }]);
			mockTx.booking.count.mockResolvedValue(1);

			const actor = createMockUser({ role: "admin" });
			const dto = { slot_id: slot.id };

			await expect(service.createBooking(actor, dto)).rejects.toThrow(
				ConflictException,
			);
		});
	});

	describe("cancelBooking", () => {
		it("should throw NotFoundException when booking not found", async () => {
			mockTx.$queryRaw.mockResolvedValue([]);

			const actor = createMockUser();
			const dto = { cancel_reason: "schedule_conflict" };

			await expect(
				service.cancelBooking("non-existent", actor, dto),
			).rejects.toThrow(NotFoundException);
		});
	});

	describe("getBooking", () => {
		it("should throw ForbiddenException when student accesses other booking", async () => {
			const booking = {
				id: "booking-id",
				studentId: "other-student-id",
				slot: { taId: "ta-id" },
				assignment: { course: { ownerId: "instructor-id" } },
			};

			mockPrismaService.booking.findUnique.mockResolvedValue(booking);

			const actor = createMockUser({
				role: "student",
				id: "different-student-id",
			});

			await expect(service.getBooking(booking.id, actor)).rejects.toThrow(
				ForbiddenException,
			);
		});

		it("should return booking for authorized student", async () => {
			const booking = {
				id: "booking-id",
				studentId: "student-id",
				slot: { taId: "ta-id" },
				assignment: { course: { ownerId: "instructor-id" } },
			};

			mockPrismaService.booking.findUnique.mockResolvedValue(booking);

			const actor = createMockUser({ role: "student", id: "student-id" });

			const result = await service.getBooking(booking.id, actor);
			expect(result).toEqual(booking);
		});
	});
});
