import { Test, TestingModule } from "@nestjs/testing";
import { BookingStatus } from "@prisma/client";
import {
	createMockAssignment,
	createMockSlot,
	createMockUser,
} from "@test/utils/factories";
import { PrismaService } from "prisma/prisma.service";
import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	NotFoundException,
	UnprocessableEntityException,
} from "@/common/exceptions/business.exception";
import { AuditService } from "@/modules/audit/audit.service";
import { NotificationsService } from "@/modules/notifications/notifications.service";
import { BookingsService } from "./bookings.service";

describe("BookingsService", () => {
	let service: BookingsService;
	// biome-ignore lint/correctness/noUnusedVariables: <False positive - used>
	let auditService: jest.Mocked<AuditService>;
	// biome-ignore lint/correctness/noUnusedVariables: <False positive - used>
	let notificationsService: jest.Mocked<NotificationsService>;

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
		$transaction: jest.fn((callback) => callback(mockTx)),
		booking: {
			findUnique: jest.fn(),
			findMany: jest.fn(),
			update: jest.fn(),
		},
		demoSlot: {
			findUnique: jest.fn(),
		},
	};

	const mockAuditService = {
		append: jest.fn().mockResolvedValue(undefined),
	};

	const mockNotificationsService = {
		notify: jest.fn().mockResolvedValue({}),
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
				{
					provide: NotificationsService,
					useValue: mockNotificationsService,
				},
			],
		}).compile();

		service = module.get<BookingsService>(BookingsService);
		auditService = module.get(AuditService) as jest.Mocked<AuditService>;
		notificationsService = module.get(
			NotificationsService,
		) as jest.Mocked<NotificationsService>;

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

		it("should throw ConflictException when student already has booking", async () => {
			const slot = createMockSlot({ capacity: 2, status: "published" });
			const assignment = createMockAssignment();

			mockTx.$queryRaw.mockResolvedValue([{ ...slot, assignment }]);
			mockTx.booking.count.mockResolvedValue(0);
			mockTx.booking.findFirst.mockResolvedValue({
				id: "existing-booking",
			});

			const actor = createMockUser({ role: "student" });
			const dto = { slot_id: slot.id };

			await expect(service.createBooking(actor, dto)).rejects.toThrow(
				ConflictException,
			);
		});

		it("should throw UnprocessableEntityException when demo window closed", async () => {
			const slot = createMockSlot({ capacity: 2, status: "published" });
			const assignment = createMockAssignment({
				demoWindowEnd: new Date(Date.now() - 86400000),
			});

			mockTx.$queryRaw.mockResolvedValue([{ ...slot, assignment }]);
			mockTx.booking.count.mockResolvedValue(0);
			mockTx.booking.findFirst.mockResolvedValue(null);

			const actor = createMockUser({ role: "admin" });
			const dto = { slot_id: slot.id };

			await expect(service.createBooking(actor, dto)).rejects.toThrow(
				UnprocessableEntityException,
			);
		});

		it("should throw ForbiddenException when student not enrolled", async () => {
			const slot = createMockSlot({ capacity: 2, status: "published" });
			const assignment = createMockAssignment({
				demoWindowEnd: new Date(Date.now() + 86400000),
			});

			mockTx.$queryRaw.mockResolvedValue([{ ...slot, assignment }]);
			mockTx.booking.count.mockResolvedValue(0);
			mockTx.booking.findFirst.mockResolvedValue(null);
			mockTx.enrollment.findFirst.mockResolvedValue(null);

			const actor = createMockUser({ role: "student" });
			const dto = { slot_id: slot.id };

			await expect(service.createBooking(actor, dto)).rejects.toThrow(
				ForbiddenException,
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

		it("should throw BadRequestException for invalid booking status", async () => {
			const booking = {
				id: "booking-id",
				status: BookingStatus.cancelled_by_student,
				slot: { id: "slot-id" },
			};

			mockTx.$queryRaw.mockResolvedValue([{ id: booking.id }]);
			mockTx.booking.findUnique.mockResolvedValue(booking);

			const actor = createMockUser();
			const dto = { cancel_reason: "schedule_conflict" };

			await expect(
				service.cancelBooking(booking.id, actor, dto),
			).rejects.toThrow(BadRequestException);
		});

		it("should throw BadRequestException when cancel_note is missing for 'other' reason", async () => {
			const booking = {
				id: "booking-id",
				status: BookingStatus.booked,
				assignmentId: "assignment-id",
				slot: { id: "slot-id", startsAt: new Date(Date.now() + 86400000) },
			};

			mockTx.$queryRaw.mockResolvedValue([{ id: booking.id }]);
			mockTx.booking.findUnique.mockResolvedValue(booking);
			mockTx.assignment.findUnique.mockResolvedValue({
				id: "assignment-id",
				demoWindowEnd: new Date(Date.now() + 172800000),
				freezeBeforeMin: 60,
				maxCancellations: 2,
			});

			const actor = createMockUser();
			const dto = { cancel_reason: "other", cancel_note: "" };

			await expect(
				service.cancelBooking(booking.id, actor, dto),
			).rejects.toThrow(BadRequestException);
		});

		it("should throw UnprocessableEntityException when cancellation quota exceeded", async () => {
			const booking = {
				id: "booking-id",
				status: BookingStatus.booked,
				assignmentId: "assignment-id",
				slot: { id: "slot-id", startsAt: new Date(Date.now() + 86400000) },
			};

			mockTx.$queryRaw.mockResolvedValue([{ id: booking.id }]);
			mockTx.booking.findUnique.mockResolvedValue(booking);
			mockTx.assignment.findUnique.mockResolvedValue({
				id: "assignment-id",
				demoWindowEnd: new Date(Date.now() + 172800000),
				freezeBeforeMin: 60,
				maxCancellations: 1,
			});
			mockTx.booking.count.mockResolvedValue(1);

			const actor = createMockUser();
			const dto = { cancel_reason: "schedule_conflict" };

			await expect(
				service.cancelBooking(booking.id, actor, dto),
			).rejects.toThrow(UnprocessableEntityException);
		});
	});

	describe("rescheduleBooking", () => {
		it("should throw NotFoundException when booking not found", async () => {
			mockTx.$queryRaw.mockResolvedValue([]);

			const actor = createMockUser();
			const dto = { new_slot_id: "new-slot-id" };

			await expect(
				service.rescheduleBooking("non-existent", actor, dto),
			).rejects.toThrow(NotFoundException);
		});

		it("should throw ConflictException when new slot is not published", async () => {
			const assignment = createMockAssignment({ freezeBeforeMin: 60 });
			const booking = {
				id: "booking-id",
				status: BookingStatus.booked,
				assignmentId: assignment.id,
				slot: {
					id: "old-slot",
					startsAt: new Date(Date.now() + 86400000),
					taId: "ta-id",
					assignment: assignment,
				},
				assignment: assignment,
			};

			const newSlot = createMockSlot({
				status: "booked",
				id: "new-slot-id",
				assignmentId: assignment.id,
			});

			mockTx.$queryRaw.mockResolvedValue([{ id: booking.id }]);
			mockTx.booking.findUnique.mockResolvedValue(booking);
			mockTx.demoSlot.findUnique.mockResolvedValue(newSlot);

			const actor = createMockUser();
			const dto = { new_slot_id: newSlot.id };

			await expect(
				service.rescheduleBooking(booking.id, actor, dto),
			).rejects.toThrow(ConflictException);
		});

		it("should throw BadRequestException when new slot belongs to different assignment", async () => {
			const assignment = createMockAssignment({ id: "assignment-1" });
			const booking = {
				id: "booking-id",
				status: BookingStatus.booked,
				assignmentId: "assignment-1",
				slot: {
					id: "old-slot",
					startsAt: new Date(Date.now() + 86400000),
					taId: "ta-id",
					assignment: assignment,
				},
				assignment: assignment,
			};

			const newSlot = createMockSlot({
				assignmentId: "assignment-2",
				status: "published",
			});

			mockTx.$queryRaw.mockResolvedValue([{ id: booking.id }]);
			mockTx.booking.findUnique.mockResolvedValue(booking);
			mockTx.demoSlot.findUnique.mockResolvedValue(newSlot);

			const actor = createMockUser();
			const dto = { new_slot_id: newSlot.id };

			await expect(
				service.rescheduleBooking(booking.id, actor, dto),
			).rejects.toThrow(BadRequestException);
		});
	});

	describe("updateBookingStatus", () => {
		it("should throw ForbiddenException when TA does not own slot", async () => {
			const booking = {
				id: "booking-id",
				status: BookingStatus.booked,
				slot: { taId: "other-ta-id" },
			};

			mockPrismaService.booking.findUnique.mockResolvedValue(booking);

			const actor = createMockUser({ role: "ta", id: "different-ta-id" });
			const dto = { status: BookingStatus.completed };

			await expect(
				service.updateBookingStatus(booking.id, actor, dto),
			).rejects.toThrow(ForbiddenException);
		});

		it("should throw BadRequestException for invalid booking status", async () => {
			const booking = {
				id: "booking-id",
				status: BookingStatus.cancelled_by_student,
				slot: { taId: "ta-id" },
			};

			mockPrismaService.booking.findUnique.mockResolvedValue(booking);

			const actor = createMockUser({ role: "ta", id: "ta-id" });
			const dto = { status: BookingStatus.completed };

			await expect(
				service.updateBookingStatus(booking.id, actor, dto),
			).rejects.toThrow(BadRequestException);
		});

		it("should notify student when booking is marked as completed", async () => {
			const assignment = createMockAssignment({ title: "Demo Assignment" });
			const booking = {
				id: "booking-id",
				studentId: "student-id",
				status: BookingStatus.booked,
				slot: { taId: "ta-id" },
				assignment,
				slotId: "slot-id",
				assignmentId: assignment.id,
				student: { id: "student-id" },
			};

			mockPrismaService.booking.findUnique.mockResolvedValue(booking);
			mockPrismaService.booking.update.mockResolvedValue({
				...booking,
				status: BookingStatus.completed,
			});

			const actor = createMockUser({ role: "ta", id: "ta-id" });
			const dto = { status: BookingStatus.completed };

			await service.updateBookingStatus(booking.id, actor, dto);

			expect(mockNotificationsService.notify).toHaveBeenCalledWith(
				expect.objectContaining({
					userId: "student-id",
					title: "Demo Completed",
				}),
			);
		});

		it("should notify student when booking is marked as no-show", async () => {
			const assignment = createMockAssignment({ title: "Demo Assignment" });
			const booking = {
				id: "booking-id",
				studentId: "student-id",
				status: BookingStatus.booked,
				slot: { taId: "ta-id" },
				assignment,
				slotId: "slot-id",
				assignmentId: assignment.id,
				student: { id: "student-id" },
			};

			mockPrismaService.booking.findUnique.mockResolvedValue(booking);
			mockPrismaService.booking.update.mockResolvedValue({
				...booking,
				status: BookingStatus.no_show,
			});

			const actor = createMockUser({ role: "ta", id: "ta-id" });
			const dto = { status: BookingStatus.no_show };

			await service.updateBookingStatus(booking.id, actor, dto);

			expect(mockNotificationsService.notify).toHaveBeenCalledWith(
				expect.objectContaining({
					userId: "student-id",
					title: "No-Show Recorded",
				}),
			);
		});

		it("should create completed audit event when marking as completed", async () => {
			const assignment = createMockAssignment();
			const booking = {
				id: "booking-id",
				studentId: "student-id",
				status: BookingStatus.booked,
				slot: { taId: "ta-id" },
				assignment,
				slotId: "slot-id",
				assignmentId: assignment.id,
				student: { id: "student-id" },
			};

			mockPrismaService.booking.findUnique.mockResolvedValue(booking);
			mockPrismaService.booking.update.mockResolvedValue({
				...booking,
				status: BookingStatus.completed,
			});

			const actor = createMockUser({ role: "ta", id: "ta-id" });
			const dto = { status: BookingStatus.completed };

			await service.updateBookingStatus(booking.id, actor, dto);

			expect(mockAuditService.append).toHaveBeenCalledWith(
				expect.objectContaining({
					eventType: "completed",
				}),
			);
		});

		it("should create no_show audit event when marking as no-show", async () => {
			const assignment = createMockAssignment();
			const booking = {
				id: "booking-id",
				studentId: "student-id",
				status: BookingStatus.booked,
				slot: { taId: "ta-id" },
				assignment,
				slotId: "slot-id",
				assignmentId: assignment.id,
				student: { id: "student-id" },
			};

			mockPrismaService.booking.findUnique.mockResolvedValue(booking);
			mockPrismaService.booking.update.mockResolvedValue({
				...booking,
				status: BookingStatus.no_show,
			});

			const actor = createMockUser({ role: "ta", id: "ta-id" });
			const dto = { status: BookingStatus.no_show };

			await service.updateBookingStatus(booking.id, actor, dto);

			expect(mockAuditService.append).toHaveBeenCalledWith(
				expect.objectContaining({
					eventType: "no_show",
				}),
			);
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

		it("should return booking for TA who owns the slot", async () => {
			const booking = {
				id: "booking-id",
				studentId: "student-id",
				slot: { taId: "ta-id" },
				assignment: { course: { ownerId: "instructor-id" } },
			};

			mockPrismaService.booking.findUnique.mockResolvedValue(booking);

			const actor = createMockUser({ role: "ta", id: "ta-id" });

			const result = await service.getBooking(booking.id, actor);
			expect(result).toEqual(booking);
		});
	});

	describe("listBookingsForStudent", () => {
		it("should return bookings for student", async () => {
			const bookings = [
				{ id: "booking-1", studentId: "student-id" },
				{ id: "booking-2", studentId: "student-id" },
			];

			mockPrismaService.booking.findMany.mockResolvedValue(bookings);

			const actor = createMockUser({ id: "student-id" });

			const result = await service.listBookingsForStudent(actor.id);
			expect(result).toEqual(bookings);
		});
	});

	describe("getSlotBookings", () => {
		it("should throw ForbiddenException when TA does not own slot", async () => {
			const slot = { id: "slot-id", taId: "other-ta-id" };

			mockPrismaService.demoSlot.findUnique.mockResolvedValue(slot);

			const actor = createMockUser({ role: "ta", id: "different-ta-id" });

			await expect(service.getSlotBookings(slot.id, actor)).rejects.toThrow(
				ForbiddenException,
			);
		});

		it("should return bookings for slot when TA owns slot", async () => {
			const slot = { id: "slot-id", taId: "ta-id" };
			const bookings = [{ id: "booking-1" }, { id: "booking-2" }];

			mockPrismaService.demoSlot.findUnique.mockResolvedValue(slot);
			mockPrismaService.booking.findMany.mockResolvedValue(bookings);

			const actor = createMockUser({ role: "ta", id: "ta-id" });

			const result = await service.getSlotBookings(slot.id, actor);
			expect(result).toEqual(bookings);
		});
	});
});
