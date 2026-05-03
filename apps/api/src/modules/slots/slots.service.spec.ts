import { Test, TestingModule } from "@nestjs/testing";
import { SlotStatus, UserRole } from "@prisma/client";
import { PrismaService } from "prisma/prisma.service";
import {
	BadRequestException,
	ForbiddenException,
	NotFoundException,
} from "@/common/exceptions/business.exception";
import { AuditService } from "@/modules/audit/audit.service";
import { NotificationsService } from "@/modules/notifications/notifications.service";
import {
	createMockAssignment,
	createMockSlot,
	createMockUser,
} from "../../../test/utils/factories";
import { SlotsService } from "./slots.service";

describe("SlotsService", () => {
	let service: SlotsService;
	// biome-ignore lint/correctness/noUnusedVariables: <False Positive>
	let auditService: jest.Mocked<AuditService>;
	// biome-ignore lint/correctness/noUnusedVariables: <False Positive>
	let notificationsService: jest.Mocked<NotificationsService>;

	const mockPrismaService = {
		assignment: {
			findUnique: jest.fn(),
		},
		user: {
			findUnique: jest.fn(),
		},
		enrollment: {
			findFirst: jest.fn(),
		},
		demoSlot: {
			createManyAndReturn: jest.fn(),
			findMany: jest.fn(),
			findUnique: jest.fn(),
			update: jest.fn(),
		},
		course: {
			findFirst: jest.fn(),
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
				SlotsService,
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

		service = module.get<SlotsService>(SlotsService);
		auditService = module.get(AuditService) as jest.Mocked<AuditService>;
		notificationsService = module.get(
			NotificationsService,
		) as jest.Mocked<NotificationsService>;

		jest.clearAllMocks();
	});

	describe("generateSlots", () => {
		const generateSlotsDto = {
			ta_id: "ta-id",
		};

		it("should throw NotFoundException when assignment not found", async () => {
			mockPrismaService.assignment.findUnique.mockResolvedValue(null);

			const actor = createMockUser({ role: "instructor" });

			await expect(
				service.generateSlots("non-existent", generateSlotsDto, actor),
			).rejects.toThrow(NotFoundException);
		});

		it("should throw NotFoundException when TA not found", async () => {
			const assignment = createMockAssignment({
				demoWindowStart: new Date(Date.now() + 86400000),
				demoWindowEnd: new Date(Date.now() + 172800000),
				slotDurationMin: 30,
				slotCapacity: 1,
			});

			mockPrismaService.assignment.findUnique.mockResolvedValue(assignment);
			mockPrismaService.user.findUnique.mockResolvedValue(null);

			const actor = createMockUser({ role: "instructor" });
			mockPrismaService.course.findFirst.mockResolvedValue({});

			await expect(
				service.generateSlots(assignment.id, generateSlotsDto, actor),
			).rejects.toThrow(NotFoundException);
		});

		it("should throw BadRequestException when TA role is invalid", async () => {
			const assignment = createMockAssignment({
				demoWindowStart: new Date(Date.now() + 86400000),
				demoWindowEnd: new Date(Date.now() + 172800000),
				slotDurationMin: 30,
				slotCapacity: 1,
			});

			const ta = createMockUser({ role: UserRole.student });

			mockPrismaService.assignment.findUnique.mockResolvedValue(assignment);
			mockPrismaService.user.findUnique.mockResolvedValue(ta);
			mockPrismaService.course.findFirst.mockResolvedValue({});

			const actor = createMockUser({ role: "instructor" });

			await expect(
				service.generateSlots(assignment.id, generateSlotsDto, actor),
			).rejects.toThrow(BadRequestException);
		});

		it("should throw ForbiddenException when TA tries to create slots for another TA", async () => {
			const assignment = createMockAssignment({
				demoWindowStart: new Date(Date.now() + 86400000),
				demoWindowEnd: new Date(Date.now() + 172800000),
				slotDurationMin: 30,
				slotCapacity: 1,
			});

			const ta = createMockUser({ role: UserRole.ta, id: "other-ta-id" });

			mockPrismaService.assignment.findUnique.mockResolvedValue(assignment);
			mockPrismaService.user.findUnique.mockResolvedValue(ta);
			mockPrismaService.enrollment.findFirst.mockResolvedValue({});

			const actor = createMockUser({ role: "ta", id: "different-ta-id" });

			await expect(
				service.generateSlots(assignment.id, generateSlotsDto, actor),
			).rejects.toThrow(ForbiddenException);
		});

		it("should generate slots successfully", async () => {
			const assignment = createMockAssignment({
				demoWindowStart: new Date(Date.now() + 86400000),
				demoWindowEnd: new Date(Date.now() + 86400000 + 7200000),
				slotDurationMin: 60,
				slotCapacity: 1,
				defaultVenue: "Room 101",
			});

			const ta = createMockUser({ role: UserRole.ta });

			mockPrismaService.assignment.findUnique.mockResolvedValue(assignment);
			mockPrismaService.user.findUnique.mockResolvedValue(ta);
			mockPrismaService.enrollment.findFirst.mockResolvedValue({});
			mockPrismaService.demoSlot.createManyAndReturn.mockResolvedValue([
				createMockSlot({ assignmentId: assignment.id, taId: ta.id }),
			]);
			mockPrismaService.course.findFirst.mockResolvedValue({});

			const actor = createMockUser({ role: "instructor" });

			const result = await service.generateSlots(
				assignment.id,
				generateSlotsDto,
				actor,
			);

			expect(result.slots).toHaveLength(1);
			expect(result.count).toBe(1);
		});
	});

	describe("listSlots", () => {
		it("should throw NotFoundException when assignment not found", async () => {
			mockPrismaService.assignment.findUnique.mockResolvedValue(null);

			const actor = createMockUser();

			await expect(
				service.listSlots("non-existent", {}, actor),
			).rejects.toThrow(NotFoundException);
		});

		it("should return only published slots for students", async () => {
			const assignment = createMockAssignment();
			const slots = [
				createMockSlot({ status: SlotStatus.published }),
				createMockSlot({ status: SlotStatus.published }),
			];

			mockPrismaService.assignment.findUnique.mockResolvedValue(assignment);
			mockPrismaService.demoSlot.findMany.mockResolvedValue(slots);

			const actor = createMockUser({ role: "student" });

			const result = await service.listSlots(assignment.id, {}, actor);

			expect(result.slots).toHaveLength(2);
			expect(mockPrismaService.demoSlot.findMany).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({ status: SlotStatus.published }),
				}),
			);
		});

		it("should return TA's slots for TA role", async () => {
			const assignment = createMockAssignment();
			const ta = createMockUser({ role: "ta", id: "ta-id" });
			const slots = [createMockSlot({ taId: ta.id })];

			mockPrismaService.assignment.findUnique.mockResolvedValue(assignment);
			mockPrismaService.demoSlot.findMany.mockResolvedValue(slots);

			const result = await service.listSlots(assignment.id, {}, ta);

			expect(result.slots).toHaveLength(1);
			expect(mockPrismaService.demoSlot.findMany).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({ taId: ta.id }),
				}),
			);
		});
	});

	describe("updateSlot", () => {
		it("should throw NotFoundException when slot not found", async () => {
			mockPrismaService.demoSlot.findUnique.mockResolvedValue(null);

			const actor = createMockUser();
			const dto = { status: SlotStatus.published };

			await expect(
				service.updateSlot("non-existent", dto, actor),
			).rejects.toThrow(NotFoundException);
		});

		it("should throw ForbiddenException when TA tries to update another TA's slot", async () => {
			const slot = createMockSlot({ taId: "other-ta-id" });

			mockPrismaService.demoSlot.findUnique.mockResolvedValue(slot);

			const actor = createMockUser({ role: "ta", id: "different-ta-id" });
			const dto = { status: SlotStatus.published };

			await expect(service.updateSlot(slot.id, dto, actor)).rejects.toThrow(
				ForbiddenException,
			);
		});

		it("should throw BadRequestException when nothing to update", async () => {
			const slot = createMockSlot();

			mockPrismaService.demoSlot.findUnique.mockResolvedValue(slot);

			const actor = createMockUser({ role: "ta", id: slot.taId });

			await expect(service.updateSlot(slot.id, {}, actor)).rejects.toThrow(
				BadRequestException,
			);
		});

		it("should throw BadRequestException when publishing without venue", async () => {
			const slot = createMockSlot({
				status: SlotStatus.draft,
				venue: null,
			});

			mockPrismaService.demoSlot.findUnique.mockResolvedValue(slot);

			const actor = createMockUser({ role: "ta", id: slot.taId });
			const dto = { status: SlotStatus.published };

			await expect(service.updateSlot(slot.id, dto, actor)).rejects.toThrow(
				BadRequestException,
			);
		});

		it("should throw BadRequestException when publishing with empty venue", async () => {
			const slot = createMockSlot({
				status: SlotStatus.draft,
				venue: "",
			});

			mockPrismaService.demoSlot.findUnique.mockResolvedValue(slot);

			const actor = createMockUser({ role: "ta", id: slot.taId });
			const dto = { status: SlotStatus.published };

			await expect(service.updateSlot(slot.id, dto, actor)).rejects.toThrow(
				BadRequestException,
			);
		});

		it("should publish slot successfully when venue is set", async () => {
			const slot = createMockSlot({
				status: SlotStatus.draft,
				venue: "Room 101",
			});
			const updatedSlot = { ...slot, status: SlotStatus.published };

			mockPrismaService.demoSlot.findUnique.mockResolvedValue({
				...slot,
				bookings: [],
			});
			mockPrismaService.demoSlot.update.mockResolvedValue(updatedSlot);

			const actor = createMockUser({ role: "ta", id: slot.taId });
			const dto = { status: SlotStatus.published };

			const result = await service.updateSlot(slot.id, dto, actor);

			expect(result.slot.status).toBe(SlotStatus.published);
			expect(mockAuditService.append).toHaveBeenCalledWith(
				expect.objectContaining({
					eventType: "published",
					payload: expect.objectContaining({
						previousStatus: SlotStatus.draft,
						newStatus: SlotStatus.published,
					}),
				}),
			);
		});

		it("should create unpublished audit event when unpublishing", async () => {
			const slot = createMockSlot({
				status: SlotStatus.published,
				venue: "Room 101",
			});
			const updatedSlot = { ...slot, status: SlotStatus.draft };

			mockPrismaService.demoSlot.findUnique.mockResolvedValue({
				...slot,
				bookings: [],
			});
			mockPrismaService.demoSlot.update.mockResolvedValue(updatedSlot);

			const actor = createMockUser({ role: "ta", id: slot.taId });
			const dto = { status: SlotStatus.draft };

			await service.updateSlot(slot.id, dto, actor);

			expect(mockAuditService.append).toHaveBeenCalledWith(
				expect.objectContaining({
					eventType: "unpublished",
					payload: expect.objectContaining({
						previousStatus: SlotStatus.published,
						newStatus: SlotStatus.draft,
					}),
				}),
			);
		});

		it("should notify students on venue change for published slot", async () => {
			const slot = createMockSlot({
				status: SlotStatus.published,
				venue: "Old Venue",
			});
			const updatedSlot = { ...slot, venue: "New Venue" };
			const bookings = [
				{
					id: "booking-1",
					studentId: "student-1",
					student: { id: "student-1", name: "Student 1" },
				},
			];

			mockPrismaService.demoSlot.findUnique.mockResolvedValue({
				...slot,
				bookings,
			});
			mockPrismaService.demoSlot.update.mockResolvedValue(updatedSlot);

			const actor = createMockUser({ role: "ta", id: slot.taId });
			const dto = { venue: "New Venue" };

			await service.updateSlot(slot.id, dto, actor);

			expect(mockNotificationsService.notify).toHaveBeenCalledWith(
				expect.objectContaining({
					userId: "student-1",
					type: "venue_changed",
				}),
			);
		});

		it("should notify students on venue change for booked slot", async () => {
			const slot = createMockSlot({
				status: SlotStatus.booked,
				venue: "Old Venue",
			});
			const updatedSlot = { ...slot, venue: "New Venue" };
			const bookings = [
				{
					id: "booking-1",
					studentId: "student-1",
					student: { id: "student-1", name: "Student 1" },
				},
			];

			mockPrismaService.demoSlot.findUnique.mockResolvedValue({
				...slot,
				bookings,
			});
			mockPrismaService.demoSlot.update.mockResolvedValue(updatedSlot);

			const actor = createMockUser({ role: "ta", id: slot.taId });
			const dto = { venue: "New Venue" };

			await service.updateSlot(slot.id, dto, actor);

			expect(mockNotificationsService.notify).toHaveBeenCalledWith(
				expect.objectContaining({
					userId: "student-1",
					type: "venue_changed",
				}),
			);
		});

		it("should not notify students on venue change for draft slot", async () => {
			const slot = createMockSlot({
				status: SlotStatus.draft,
				venue: "Old Venue",
			});
			const updatedSlot = { ...slot, venue: "New Venue" };
			const bookings = [
				{
					id: "booking-1",
					studentId: "student-1",
					student: { id: "student-1", name: "Student 1" },
				},
			];

			mockPrismaService.demoSlot.findUnique.mockResolvedValue({
				...slot,
				bookings,
			});
			mockPrismaService.demoSlot.update.mockResolvedValue(updatedSlot);

			const actor = createMockUser({ role: "ta", id: slot.taId });
			const dto = { venue: "New Venue" };

			await service.updateSlot(slot.id, dto, actor);

			expect(mockNotificationsService.notify).not.toHaveBeenCalled();
		});

		it("should update slot venue successfully", async () => {
			const slot = createMockSlot({ venue: "Old Venue" });
			const updatedSlot = { ...slot, venue: "New Venue" };

			mockPrismaService.demoSlot.findUnique.mockResolvedValue({
				...slot,
				bookings: [],
			});
			mockPrismaService.demoSlot.update.mockResolvedValue(updatedSlot);

			const actor = createMockUser({ role: "ta", id: slot.taId });
			const dto = { venue: "New Venue" };

			const result = await service.updateSlot(slot.id, dto, actor);

			expect(result.slot.venue).toBe("New Venue");
		});
	});
});
