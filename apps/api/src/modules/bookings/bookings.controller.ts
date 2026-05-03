import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	Param,
	ParseUUIDPipe,
	Patch,
	Post,
	Req,
	UnauthorizedException,
} from "@nestjs/common";
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
import { User } from "@prisma/client";
import { Roles } from "@/modules/auth/decorators/roles.decorator";
import { BookingsService } from "./bookings.service";
import { CancelBookingDto } from "./dto/cancel-booking.dto";
import { CreateBookingDto } from "./dto/create-booking.dto";
import { RescheduleBookingDto } from "./dto/reschedule-booking.dto";
import { UpdateBookingStatusDto } from "./dto/update-booking-status.dto";

@ApiTags("Bookings")
@Controller({
	path: "bookings",
	version: "1",
})
export class BookingsController {
	constructor(private readonly bookingsService: BookingsService) {}

	@Post()
	@ApiOperation({ summary: "Create a new booking for a slot" })
	@ApiResponse({ status: 201, description: "Booking created successfully" })
	@ApiResponse({ status: 409, description: "Slot is full or already booked" })
	@Roles("student", "admin")
	async createBooking(@Body() dto: CreateBookingDto, @Req() req: Request) {
		const user = (req as { user?: User }).user;
		if (!user) {
			throw new UnauthorizedException();
		}

		const booking = await this.bookingsService.createBooking(user, dto);

		return { booking };
	}

	@Get()
	@ApiOperation({ summary: "List bookings for the authenticated student" })
	@ApiResponse({ status: 200, description: "List of bookings" })
	@Roles("student", "admin")
	async listBookings(@Req() req: Request) {
		const user = (req as { user?: User }).user;
		if (!user) {
			throw new UnauthorizedException();
		}

		const bookings = await this.bookingsService.listBookingsForStudent(user.id);
		return { bookings };
	}

	@Get(":bookingId")
	@ApiOperation({ summary: "Get a specific booking by ID" })
	@ApiParam({
		name: "bookingId",
		description: "UUID of the booking",
		format: "uuid",
	})
	@ApiResponse({ status: 200, description: "Booking details" })
	@ApiResponse({ status: 404, description: "Booking not found" })
	@Roles("student", "ta", "instructor", "admin")
	async getBooking(
		@Param("bookingId", ParseUUIDPipe) bookingId: string,
		@Req() req: Request,
	) {
		const user = (req as { user?: User }).user;
		if (!user) {
			throw new UnauthorizedException();
		}
		const booking = await this.bookingsService.getBooking(bookingId, user);
		return { booking };
	}

	@Post(":bookingId/reschedule")
	@ApiOperation({ summary: "Reschedule a booking to a new slot" })
	@ApiParam({
		name: "bookingId",
		description: "UUID of the booking to reschedule",
		format: "uuid",
	})
	@ApiResponse({ status: 200, description: "Booking rescheduled successfully" })
	@ApiResponse({ status: 409, description: "New slot is full" })
	@Roles("student", "admin")
	async rescheduleBooking(
		@Param("bookingId", ParseUUIDPipe) bookingId: string,
		@Body() dto: RescheduleBookingDto,
		@Req() req: Request,
	) {
		const user = (req as { user?: User }).user;
		if (!user) {
			throw new UnauthorizedException();
		}

		const booking = await this.bookingsService.rescheduleBooking(
			bookingId,
			user,
			dto,
		);

		return { booking };
	}

	@Delete(":bookingId")
	@HttpCode(204)
	@ApiOperation({ summary: "Cancel a booking" })
	@ApiParam({
		name: "bookingId",
		description: "UUID of the booking to cancel",
		format: "uuid",
	})
	@ApiResponse({ status: 204, description: "Booking cancelled successfully" })
	@Roles("student", "admin")
	async cancelBooking(
		@Param("bookingId", ParseUUIDPipe) bookingId: string,
		@Body() dto: CancelBookingDto,
		@Req() req: Request,
	) {
		const user = (req as { user?: User }).user;
		if (!user) {
			throw new UnauthorizedException();
		}

		await this.bookingsService.cancelBooking(bookingId, user, dto);
	}

	@Patch(":bookingId/status")
	@ApiOperation({ summary: "Update booking status (TA/admin only)" })
	@ApiParam({
		name: "bookingId",
		description: "UUID of the booking",
		format: "uuid",
	})
	@ApiResponse({ status: 200, description: "Booking status updated" })
	@Roles("ta", "admin")
	async updateBookingStatus(
		@Param("bookingId", ParseUUIDPipe) bookingId: string,
		@Body() dto: UpdateBookingStatusDto,
		@Req() req: Request,
	) {
		const user = (req as { user?: User }).user;
		if (!user) {
			throw new UnauthorizedException();
		}

		const booking = await this.bookingsService.updateBookingStatus(
			bookingId,
			user,
			dto,
		);

		return { booking };
	}
}
