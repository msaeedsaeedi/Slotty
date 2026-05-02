import { UnauthorizedException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { User } from "@prisma/client";
import { BookingsController } from "./bookings.controller";
import { BookingsService } from "./bookings.service";
import { CancelBookingDto } from "./dto/cancel-booking.dto";
import { CreateBookingDto } from "./dto/create-booking.dto";
import { RescheduleBookingDto } from "./dto/reschedule-booking.dto";
import { UpdateBookingStatusDto } from "./dto/update-booking-status";

describe("BookingsController", () => {
	let controller: BookingsController;
	let mockBookingsService: any;

	const mockUser: User = {
		id: "user-id",
		email: "test@example.com",
		name: "Test User",
		role: "student",
		status: "active",
		googleId: null,
		rollNumber: null,
		deletedAt: null,
		createdAt: new Date(),
		updatedAt: new Date(),
	};

	beforeEach(async () => {
		mockBookingsService = {
			createBooking: jest.fn(),
			listBookingsForStudent: jest.fn(),
			getBooking: jest.fn(),
			rescheduleBooking: jest.fn(),
			cancelBooking: jest.fn(),
			updateBookingStatus: jest.fn(),
		};

		const module: TestingModule = await Test.createTestingModule({
			controllers: [BookingsController],
			providers: [{ provide: BookingsService, useValue: mockBookingsService }],
		}).compile();

		controller = module.get<BookingsController>(BookingsController);

		jest.clearAllMocks();
	});

	describe("createBooking", () => {
		const dto: CreateBookingDto = { slot_id: "slot-id" };

		it("should throw UnauthorizedException when user not authenticated", async () => {
			await expect(
				controller.createBooking(dto, { user: undefined } as any),
			).rejects.toThrow(UnauthorizedException);
		});

		it("should create booking successfully", async () => {
			const booking = { id: "booking-id", slotId: "slot-id" };
			mockBookingsService.createBooking.mockResolvedValue(booking);

			const result = await controller.createBooking(dto, {
				user: mockUser,
			} as any);

			expect(result).toEqual({ booking });
			expect(mockBookingsService.createBooking).toHaveBeenCalledWith(
				mockUser,
				dto,
			);
		});
	});

	describe("listBookings", () => {
		it("should throw UnauthorizedException when user not authenticated", async () => {
			await expect(
				controller.listBookings({ user: undefined } as any),
			).rejects.toThrow(UnauthorizedException);
		});

		it("should return bookings for student", async () => {
			const bookings = [{ id: "booking-1" }, { id: "booking-2" }];
			mockBookingsService.listBookingsForStudent.mockResolvedValue(bookings);

			const result = await controller.listBookings({ user: mockUser } as any);

			expect(result).toEqual({ bookings });
			expect(mockBookingsService.listBookingsForStudent).toHaveBeenCalledWith(
				mockUser.id,
			);
		});
	});

	describe("getBooking", () => {
		it("should throw UnauthorizedException when user not authenticated", async () => {
			await expect(
				controller.getBooking("booking-id", { user: undefined } as any),
			).rejects.toThrow(UnauthorizedException);
		});

		it("should return booking", async () => {
			const booking = { id: "booking-id" };
			mockBookingsService.getBooking.mockResolvedValue(booking);

			const result = await controller.getBooking("booking-id", {
				user: mockUser,
			} as any);

			expect(result).toEqual({ booking });
			expect(mockBookingsService.getBooking).toHaveBeenCalledWith(
				"booking-id",
				mockUser,
			);
		});
	});

	describe("rescheduleBooking", () => {
		const dto: RescheduleBookingDto = { new_slot_id: "new-slot-id" };

		it("should throw UnauthorizedException when user not authenticated", async () => {
			await expect(
				controller.rescheduleBooking("booking-id", dto, {
					user: undefined,
				} as any),
			).rejects.toThrow(UnauthorizedException);
		});

		it("should reschedule booking successfully", async () => {
			const booking = { id: "booking-id", slotId: "new-slot-id" };
			mockBookingsService.rescheduleBooking.mockResolvedValue(booking);

			const result = await controller.rescheduleBooking("booking-id", dto, {
				user: mockUser,
			} as any);

			expect(result).toEqual({ booking });
			expect(mockBookingsService.rescheduleBooking).toHaveBeenCalledWith(
				"booking-id",
				mockUser,
				dto,
			);
		});
	});

	describe("cancelBooking", () => {
		const dto: CancelBookingDto = { cancel_reason: "schedule_conflict" };

		it("should throw UnauthorizedException when user not authenticated", async () => {
			await expect(
				controller.cancelBooking("booking-id", dto, { user: undefined } as any),
			).rejects.toThrow(UnauthorizedException);
		});

		it("should cancel booking successfully", async () => {
			mockBookingsService.cancelBooking.mockResolvedValue(undefined);

			await controller.cancelBooking("booking-id", dto, {
				user: mockUser,
			} as any);

			expect(mockBookingsService.cancelBooking).toHaveBeenCalledWith(
				"booking-id",
				mockUser,
				dto,
			);
		});
	});

	describe("updateBookingStatus", () => {
		const dto: UpdateBookingStatusDto = { status: "completed" };

		it("should throw UnauthorizedException when user not authenticated", async () => {
			await expect(
				controller.updateBookingStatus("booking-id", dto, {
					user: undefined,
				} as any),
			).rejects.toThrow(UnauthorizedException);
		});

		it("should update booking status successfully", async () => {
			const booking = { id: "booking-id", status: "completed" };
			mockBookingsService.updateBookingStatus.mockResolvedValue(booking);

			const result = await controller.updateBookingStatus("booking-id", dto, {
				user: mockUser,
			} as any);

			expect(result).toEqual({ booking });
			expect(mockBookingsService.updateBookingStatus).toHaveBeenCalledWith(
				"booking-id",
				mockUser,
				dto,
			);
		});
	});
});
