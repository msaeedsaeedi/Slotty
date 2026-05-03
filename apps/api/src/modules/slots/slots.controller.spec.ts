import { Test, TestingModule } from "@nestjs/testing";
import { User } from "@prisma/client";
import { RequestWithUser } from "@/modules/auth/auth.types";
import { BookingsService } from "@/modules/bookings/bookings.service";
import { GenerateSlotsDto } from "./dto/generate-slots.dto";
import { ListSlotsQueryDto } from "./dto/list-slots-query.dto";
import { UpdateSlotDto } from "./dto/update-slot.dto";
import { SlotsController } from "./slots.controller";
import { SlotsService } from "./slots.service";

describe("SlotsController", () => {
	let controller: SlotsController;
	let mockSlotsService: any;
	let mockBookingsService: any;

	const mockUser: User = {
		id: "user-id",
		email: "test@example.com",
		name: "Test User",
		role: "ta",
		status: "active",
		googleId: null,
		rollNumber: null,
		deletedAt: null,
		createdAt: new Date(),
		updatedAt: new Date(),
	};

	const mockRequest = (user: User): RequestWithUser =>
		({ user }) as RequestWithUser;

	beforeEach(async () => {
		mockSlotsService = {
			generateSlots: jest.fn(),
			listSlots: jest.fn(),
			updateSlot: jest.fn(),
		};

		mockBookingsService = {
			getSlotBookings: jest.fn(),
		};

		const module: TestingModule = await Test.createTestingModule({
			controllers: [SlotsController],
			providers: [
				{ provide: SlotsService, useValue: mockSlotsService },
				{ provide: BookingsService, useValue: mockBookingsService },
			],
		}).compile();

		controller = module.get<SlotsController>(SlotsController);

		jest.clearAllMocks();
	});

	describe("generateSlots", () => {
		const dto: GenerateSlotsDto = { ta_id: "ta-id" };

		it("should generate slots successfully", async () => {
			const result = { slots: [{ id: "slot-1" }], count: 1 };
			mockSlotsService.generateSlots.mockResolvedValue(result);

			const response = await controller.generateSlots(
				"assignment-id",
				dto,
				mockRequest(mockUser),
			);

			expect(response).toEqual(result);
			expect(mockSlotsService.generateSlots).toHaveBeenCalledWith(
				"assignment-id",
				dto,
				mockUser,
			);
		});
	});

	describe("listSlots", () => {
		const query: ListSlotsQueryDto = {};

		it("should list slots successfully", async () => {
			const result = { slots: [{ id: "slot-1" }], count: 1 };
			mockSlotsService.listSlots.mockResolvedValue(result);

			const response = await controller.listSlots(
				"assignment-id",
				query,
				mockRequest(mockUser),
			);

			expect(response).toEqual(result);
			expect(mockSlotsService.listSlots).toHaveBeenCalledWith(
				"assignment-id",
				query,
				mockUser,
			);
		});
	});

	describe("updateSlot", () => {
		const dto: UpdateSlotDto = { venue: "New Venue" };

		it("should update slot successfully", async () => {
			const result = { slot: { id: "slot-id", venue: "New Venue" } };
			mockSlotsService.updateSlot.mockResolvedValue(result);

			const response = await controller.updateSlot(
				"slot-id",
				dto,
				mockRequest(mockUser),
			);

			expect(response).toEqual(result);
			expect(mockSlotsService.updateSlot).toHaveBeenCalledWith(
				"slot-id",
				dto,
				mockUser,
			);
		});
	});

	describe("getSlotBookings", () => {
		it("should return slot bookings", async () => {
			const bookings = [{ id: "booking-1" }, { id: "booking-2" }];
			mockBookingsService.getSlotBookings.mockResolvedValue(bookings);

			const response = await controller.getSlotBookings(
				"slot-id",
				mockRequest(mockUser),
			);

			expect(response).toEqual({ bookings });
			expect(mockBookingsService.getSlotBookings).toHaveBeenCalledWith(
				"slot-id",
				mockUser,
			);
		});
	});
});
