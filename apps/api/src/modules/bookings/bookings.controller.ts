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
import { User } from "@prisma/client";
import { Roles } from "@/modules/auth/decorators/roles.decorator";
import { BookingsService } from "./bookings.service";
import { CancelBookingDto } from "./dto/cancel-booking.dto";
import { CreateBookingDto } from "./dto/create-booking.dto";
import { RescheduleBookingDto } from "./dto/reschedule-booking.dto";
import { UpdateBookingStatusDto } from "./dto/update-booking-status";

@Controller({
	path: "bookings",
	version: "1",
})
export class BookingsController {
	constructor(private readonly bookingsService: BookingsService) {}

	@Post()
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
