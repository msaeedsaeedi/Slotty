import { Test, TestingModule } from "@nestjs/testing";
import { SlotStatus, UserRole } from "@prisma/client";
import { PrismaService } from "prisma/prisma.service";
import {
	BadRequestException,
	ForbiddenException,
	NotFoundException,
} from "@/common/exceptions/business.exception";
import { AuditService } from "@/modules/audit/audit.service";
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
			],
		}).compile();

		service = module.get<SlotsService>(SlotsService);
		auditService = module.get(AuditService) as jest.Mocked<AuditService>;

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
			mockPrismaService.course.findFirst.mockResolvedValue({}); // isCourseOwner returns true

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

			const ta = createMockUser({ role: UserRole.student }); // Not a TA

			mockPrismaService.assignment.findUnique.mockResolvedValue(assignment);
			mockPrismaService.user.findUnique.mockResolvedValue(ta);
			mockPrismaService.course.findFirst.mockResolvedValue({}); // isCourseOwner returns true

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
				demoWindowEnd: new Date(Date.now() + 86400000 + 7200000), // 2 hours later
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
			mockPrismaService.course.findFirst.mockResolvedValue({}); // isCourseOwner returns true

			const actor = createMockUser({ role: "instructor" });

			const result = await service.generateSlots(
				assignment.id,
				generateSlotsDto,
				actor,
			);

			expect(result.slots).toHaveLength(1);
			expect(result.count).toBe(1);
		});

		it("should throw NotFoundException when TA not found", async () => {
			const assignment = createMockAssignment({
				demoWindowStart: new Date(Date.now() + 86400000),
				demoWindowEnd: new Date(Date.now() + 172800000),
				slotDurationMin: 30,
				slotCapacity: 1,
				defaultVenue: "Room 101",
			});

			mockPrismaService.assignment.findUnique.mockResolvedValue(assignment);
			mockPrismaService.user.findUnique.mockResolvedValue(null);

			const actor = createMockUser({ role: "instructor" });

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

			const ta = createMockUser({ role: UserRole.student }); // Not a TA

			mockPrismaService.assignment.findUnique.mockResolvedValue(assignment);
			mockPrismaService.user.findUnique.mockResolvedValue(ta);

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
				demoWindowEnd: new Date(Date.now() + 86400000 + 7200000), // 2 hours later
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

		it("should update slot venue successfully", async () => {
			const slot = createMockSlot({ venue: "Old Venue" });
			const updatedSlot = { ...slot, venue: "New Venue" };

			mockPrismaService.demoSlot.findUnique.mockResolvedValue(slot);
			mockPrismaService.demoSlot.update.mockResolvedValue(updatedSlot);

			const actor = createMockUser({ role: "ta", id: slot.taId });
			const dto = { venue: "New Venue" };

			const result = await service.updateSlot(slot.id, dto, actor);

			expect(result.slot.venue).toBe("New Venue");
		});
	});
});
