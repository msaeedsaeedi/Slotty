import { Injectable } from "@nestjs/common";
import { Assignment, Booking, DemoSlot, Prisma, User } from "@repo/database";
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
import { CancelBookingDto } from "./dto/cancel-booking.dto";
import { CreateBookingDto } from "./dto/create-booking.dto";
import { RescheduleBookingDto } from "./dto/reschedule-booking.dto";
import { UpdateBookingStatusDto } from "./dto/update-booking-status.dto";

@Injectable()
export class BookingsService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly auditService: AuditService,
		private readonly notificationsService: NotificationsService,
	) {}

	async createBooking(
		actor: User,
		dto: CreateBookingDto,
	): Promise<Booking & { slot: DemoSlot; assignment: Assignment }> {
		const result = await this.prisma.$transaction(async (tx) => {
			// Step 1: Fetch slot (with Row-Level Lock) and associated assignment
			const slots = await tx.$queryRaw<
				(DemoSlot & { assignment: Assignment })[]
			>`
                SELECT s.*, row_to_json(a.*) as assignment
                FROM "DemoSlot" s
                JOIN "Assignment" a ON a.id = s."assignmentId"
                WHERE s.id = ${dto.slot_id}
                FOR UPDATE
        `;

			const slot = slots[0];

			if (!slot) {
				throw new NotFoundException("Slot not found.");
			}

			// Step 2: Verify slot is published
			if (slot.status !== "published") {
				throw new ConflictException(
					"SLOT_NOT_AVAILABLE",
					`Slot is not available for booking (status: ${slot.status}).`,
				);
			}

			const assignment = slot.assignment;

			// Step 3: Count active bookings and verify capacity
			const activeBookingCount = await tx.booking.count({
				where: {
					slotId: slot.id,
					status: "booked",
				},
			});

			if (activeBookingCount >= slot.capacity) {
				throw new ConflictException(
					"SLOT_FULL",
					`Slot is at capacity (${activeBookingCount}/${slot.capacity}). No available spots remaining.`,
				);
			}

			// Step 4: Verify student has no existing active booking
			const existingBooking = await tx.booking.findFirst({
				where: {
					studentId: actor.id,
					assignmentId: assignment.id,
					status: "booked",
				},
			});

			if (existingBooking) {
				throw new ConflictException(
					"DUPLICATE_BOOKING",
					"You already have an active booking for this assignment. Only one booking per assignment is allowed.",
				);
			}

			const now = new Date();

			if (now > assignment.demoWindowEnd) {
				throw new UnprocessableEntityException(
					"DEMO_WINDOW_CLOSED",
					"Assignment demo window has closed. Booking is no longer permitted.",
				);
			}

			if (actor.role !== "admin") {
				await this.assertStudentEnrollment(tx, actor.id, assignment.courseId);
			}

			// Freeze window check
			const freezeStartsAt = new Date(
				new Date(slot.startsAt).getTime() -
					assignment.freezeBeforeMin * 60 * 1000,
			);

			if (now > freezeStartsAt) {
				throw new UnprocessableEntityException(
					"FREEZE_WINDOW_ACTIVE",
					`Booking is not permitted within ${assignment.freezeBeforeMin} minutes of the slot start time. The freeze window started at ${freezeStartsAt.toISOString()}.`,
				);
			}

			// Step 5: Insert booking
			const savedBooking = await tx.booking.create({
				data: {
					slotId: slot.id,
					studentId: actor.id,
					assignmentId: assignment.id,
					status: "booked",
					bookedAt: now,
				},
			});

			// Step 6: Update slot status if full
			const updatedBookingCount = activeBookingCount + 1;

			if (updatedBookingCount >= slot.capacity) {
				await tx.demoSlot.update({
					where: { id: slot.id },
					data: { status: "booked" },
				});
			}

			// Return full booking with relations
			const fullBooking = await tx.booking.findUnique({
				where: { id: savedBooking.id },
				include: {
					slot: true,
					assignment: true,
				},
			});

			if (!fullBooking) {
				throw new NotFoundException(
					"Booking not found after creation. Please contact support.",
				);
			}

			return fullBooking;
		});

		await this.auditService.append({
			actorId: actor.id,
			entityType: "booking",
			entityId: result.id,
			eventType: "created",
			payload: {
				slotId: result.slotId,
				assignmentId: result.assignmentId,
				studentId: result.studentId,
			},
		});

		await this.notificationsService.notify({
			userId: actor.id,
			type: "booking_confirmed",
			title: "Booking Confirmed",
			body: `Your booking for "${result.assignment.title}" has been confirmed.`,
			data: {
				bookingId: result.id,
				slotId: result.slotId,
				assignmentId: result.assignmentId,
				startsAt: result.slot.startsAt.toISOString(),
				endsAt: result.slot.endsAt.toISOString(),
				venue: result.slot.venue,
			},
			channels: ["inapp", "email"],
		});

		return result;
	}

	async listBookingsForStudent(studentId: string): Promise<Booking[]> {
		return this.prisma.booking.findMany({
			where: { studentId },
			orderBy: { createdAt: "desc" },
		});
	}

	async getBooking(bookingId: string, actor: User): Promise<Booking> {
		const booking = await this.prisma.booking.findUnique({
			where: { id: bookingId },
			include: {
				slot: true,
				assignment: {
					include: { course: true },
				},
				student: true,
			},
		});

		if (!booking) {
			throw new NotFoundException("Booking not found.");
		}

		if (actor.role === "student" && booking.studentId !== actor.id) {
			throw new ForbiddenException(
				"BOOKING_ACCESS_DENIED",
				"You do not have permission to view this booking.",
			);
		}

		if (actor.role === "ta" && booking.slot.taId !== actor.id) {
			throw new ForbiddenException(
				"BOOKING_ACCESS_DENIED",
				"You do not have permission to view this booking.",
			);
		}

		if (
			actor.role === "instructor" &&
			booking.assignment.course.ownerId !== actor.id
		) {
			throw new ForbiddenException(
				"BOOKING_ACCESS_DENIED",
				"You do not have permission to view this booking.",
			);
		}

		return booking;
	}

	async getSlotBookings(slotId: string, actor: User): Promise<Booking[]> {
		const slot = await this.prisma.demoSlot.findUnique({
			where: { id: slotId },
		});
		if (!slot) {
			throw new NotFoundException("Slot not found.");
		}
		if (actor.role === "ta" && slot.taId !== actor.id) {
			throw new ForbiddenException(
				"SLOT_ACCESS_DENIED",
				"You do not have permission to view bookings for this slot.",
			);
		}

		return this.prisma.booking.findMany({
			where: { slotId },
			include: { student: true, assignment: true },
			orderBy: { bookedAt: "asc" },
		});
	}

	async rescheduleBooking(
		bookingId: string,
		actor: User,
		dto: RescheduleBookingDto,
	): Promise<Booking & { slot: DemoSlot; assignment: Assignment }> {
		const result = await this.prisma.$transaction(async (tx) => {
			// Step 1: Lock current booking row + its slot row atomically.
			const locked = await tx.$queryRaw<{ id: string }[]>`
				SELECT b.id
				FROM bookings b
				JOIN demo_slots s ON s.id = b.slot_id
				WHERE b.id = ${bookingId}::uuid
				AND b.student_id = ${actor.id}::uuid
				FOR UPDATE OF b, s
			`;

			if (!locked.length) {
				throw new NotFoundException("Booking not found.");
			}

			// Locks are held — safe to read the full shape via Prisma now.
			const currentBooking = await tx.booking.findUnique({
				where: { id: bookingId },
				include: { slot: true, assignment: true },
			});

			if (!currentBooking) {
				throw new NotFoundException("Booking not found.");
			}

			// Step 2: Validate current booking
			if (currentBooking.status !== "booked") {
				throw new BadRequestException(
					"INVALID_BOOKING_STATUS",
					`Cannot reschedule a booking with status: ${currentBooking.status}`,
				);
			}

			const now = new Date();
			const { slot, assignment } = currentBooking;

			const freezeStartsAt = new Date(
				slot.startsAt.getTime() - assignment.freezeBeforeMin * 60 * 1000,
			);

			if (now > freezeStartsAt) {
				throw new UnprocessableEntityException(
					"FREEZE_WINDOW_ACTIVE",
					`Rescheduling is not permitted within ${assignment.freezeBeforeMin} minutes of the slot start time. The freeze window started at ${freezeStartsAt.toISOString()}.`,
				);
			}

			// Step 3: Cancel current booking
			await tx.booking.update({
				where: { id: bookingId },
				data: {
					status: "cancelled_by_student",
					cancelledAt: now,
					cancelReason: "reschedule",
				},
			});

			// Step 4: Reopen old slot if it was marked full.
			if (slot.status === "booked") {
				await tx.demoSlot.update({
					where: { id: slot.id },
					data: { status: "published" },
				});
			}

			// Step 5: Lock new slot row before any reads or writes against it.
			const newSlotLock = await tx.$queryRaw<{ id: string }[]>`
				SELECT id FROM demo_slots
				WHERE id = ${dto.new_slot_id}::uuid
				FOR UPDATE
			`;

			if (!newSlotLock.length) {
				throw new NotFoundException("New slot not found.");
			}

			const newSlot = await tx.demoSlot.findUnique({
				where: { id: dto.new_slot_id },
			});

			// Null-guard (satisfies TypeScript; row is guaranteed by the lock above)
			if (!newSlot) {
				throw new NotFoundException("New slot not found.");
			}

			// Step 6: Validate new slot
			if (newSlot.status !== "published") {
				throw new ConflictException(
					"SLOT_NOT_AVAILABLE",
					"New slot is not available for booking.",
				);
			}

			if (newSlot.assignmentId !== currentBooking.assignmentId) {
				throw new BadRequestException(
					"INVALID_SLOT_ASSIGNMENT",
					"New slot must belong to the same assignment.",
				);
			}

			// Lock held — this count is authoritative (no concurrent booking can sneak in)
			const newSlotBookingCount = await tx.booking.count({
				where: { slotId: newSlot.id, status: "booked" },
			});

			if (newSlotBookingCount >= newSlot.capacity) {
				throw new ConflictException(
					"SLOT_FULL",
					`New slot is at capacity (${newSlotBookingCount}/${newSlot.capacity}). No available spots remaining.`,
				);
			}

			// Step 7: Create new booking
			const newBooking = await tx.booking.create({
				data: {
					slotId: newSlot.id,
					studentId: actor.id,
					assignmentId: currentBooking.assignmentId,
					status: "booked",
					bookedAt: now,
				},
			});

			// Step 8: Mark new slot as full if this booking fills it
			if (newSlotBookingCount + 1 >= newSlot.capacity) {
				await tx.demoSlot.update({
					where: { id: newSlot.id },
					data: { status: "booked" },
				});
			}

			// Return full booking with relations
			const fullNewBooking = await tx.booking.findUnique({
				where: { id: newBooking.id },
				include: { slot: true, assignment: true },
			});

			if (!fullNewBooking) {
				throw new NotFoundException(
					"Booking not found after rescheduling. Please contact support.",
				);
			}

			return fullNewBooking;
		});

		await Promise.all([
			this.auditService.append({
				actorId: actor.id,
				entityType: "booking",
				entityId: bookingId,
				eventType: "cancelled",
				payload: {
					reason: "reschedule",
					newSlotId: dto.new_slot_id,
				},
			}),
			this.auditService.append({
				actorId: actor.id,
				entityType: "booking",
				entityId: result.id,
				eventType: "created",
				payload: {
					slotId: result.slotId,
					assignmentId: result.assignmentId,
					studentId: result.studentId,
					rescheduledFrom: bookingId,
				},
			}),
			this.notificationsService.notify({
				userId: actor.id,
				type: "booking_confirmed",
				title: "Booking Rescheduled",
				body: `Your booking for "${result.assignment.title}" has been rescheduled.`,
				data: {
					bookingId: result.id,
					slotId: result.slotId,
					assignmentId: result.assignmentId,
					startsAt: result.slot.startsAt.toISOString(),
					endsAt: result.slot.endsAt.toISOString(),
					venue: result.slot.venue,
					rescheduledFrom: bookingId,
				},
				channels: ["inapp", "email"],
			}),
		]);

		return result;
	}

	async cancelBooking(
		bookingId: string,
		actor: User,
		dto: CancelBookingDto,
	): Promise<Booking> {
		const result = await this.prisma.$transaction(async (tx) => {
			// Lock the booking row and its slot row atomically.
			// Prevents a concurrent reschedule or double-cancel racing this request.
			const locked = await tx.$queryRaw<{ id: string }[]>`
				SELECT b.id
				FROM bookings b
				JOIN demo_slots s ON s.id = b.slot_id
				WHERE b.id = ${bookingId}::uuid
				AND b.student_id = ${actor.id}::uuid
				FOR UPDATE OF b, s
			`;

			if (!locked.length) {
				throw new NotFoundException("Booking not found.");
			}

			const booking = await tx.booking.findUnique({
				where: { id: bookingId },
				include: { slot: true },
			});

			if (!booking) {
				throw new NotFoundException("Booking not found.");
			}

			if (booking.status !== "booked") {
				throw new BadRequestException(
					"INVALID_BOOKING_STATUS",
					`Cannot cancel a booking with status: ${booking.status}`,
				);
			}

			const assignment = await tx.assignment.findUnique({
				where: { id: booking.assignmentId },
			});

			if (!assignment) {
				throw new NotFoundException("Assignment not found.");
			}

			const now = new Date();

			if (now > assignment.demoWindowEnd) {
				throw new UnprocessableEntityException(
					"DEMO_WINDOW_CLOSED",
					"Assignment demo window has closed. Cancellation is no longer permitted.",
				);
			}

			const freezeStartsAt = new Date(
				booking.slot.startsAt.getTime() -
					assignment.freezeBeforeMin * 60 * 1000,
			);

			if (now > freezeStartsAt) {
				throw new UnprocessableEntityException(
					"FREEZE_WINDOW_ACTIVE",
					`Cancellation is not permitted within the freeze window (started at ${freezeStartsAt.toISOString()}).`,
				);
			}

			// Validate DTO before hitting the quota check so bad input fails fast.
			if (dto.cancel_reason === "other" && !dto.cancel_note) {
				throw new BadRequestException(
					"MISSING_CANCEL_NOTE",
					'cancel_note is required when cancel_reason is "other".',
				);
			}

			if (dto.cancel_note && dto.cancel_note.length < 10) {
				throw new BadRequestException(
					"CANCEL_NOTE_TOO_SHORT",
					"cancel_note must be at least 10 characters when provided.",
				);
			}

			// Quota check: count prior student-initiated cancellations for this assignment.
			// Rescheduled bookings also carry status cancelled_by_student, so they
			// correctly consume from the same quota.
			const previousCancellations = await tx.booking.count({
				where: {
					studentId: actor.id,
					assignmentId: booking.assignmentId,
					status: "cancelled_by_student",
				},
			});

			if (previousCancellations >= assignment.maxCancellations) {
				throw new UnprocessableEntityException(
					"CANCELLATION_QUOTA_EXCEEDED",
					`You have used all ${assignment.maxCancellations} permitted cancellation(s) for this assignment.`,
				);
			}

			// Cancel the booking.
			const updated = await tx.booking.update({
				where: { id: bookingId },
				data: {
					status: "cancelled_by_student",
					cancelledAt: now,
					cancelReason: dto.cancel_reason,
					cancelNote: dto.cancel_note ?? null,
				},
			});

			// Reopen the slot if this booking had filled it to capacity.
			if (booking.slot.status === "booked") {
				await tx.demoSlot.update({
					where: { id: booking.slot.id },
					data: { status: "published" },
				});
			}

			return updated;
		});

		await Promise.all([
			this.auditService.append({
				actorId: actor.id,
				entityType: "booking",
				entityId: bookingId,
				eventType: "cancelled",
				payload: {
					cancelReason: dto.cancel_reason,
					cancelNote: dto.cancel_note,
					assignmentId: result.assignmentId,
					slotId: result.slotId,
				},
			}),
			this.notificationsService.notify({
				userId: actor.id,
				type: "booking_cancelled",
				title: "Booking Cancelled",
				body: `Your booking for assignment "${result.assignmentId}" has been cancelled.`,
				data: {
					bookingId,
					slotId: result.slotId,
					assignmentId: result.assignmentId,
					cancelReason: dto.cancel_reason,
				},
				channels: ["inapp", "email"],
			}),
		]);

		return result;
	}

	async updateBookingStatus(
		bookingId: string,
		actor: User,
		dto: UpdateBookingStatusDto,
	): Promise<Booking> {
		const booking = await this.prisma.booking.findUnique({
			where: { id: bookingId },
			include: {
				slot: true,
				assignment: true,
				student: true,
			},
		});

		if (!booking) {
			throw new NotFoundException("Booking not found.");
		}

		if (booking.slot.taId !== actor.id) {
			throw new ForbiddenException(
				"BOOKING_ACCESS_DENIED",
				"You do not have permission to update this booking.",
			);
		}

		if (booking.status !== "booked") {
			throw new BadRequestException(
				"INVALID_BOOKING_STATUS",
				`Cannot update a booking with status: ${booking.status}. Only 'booked' bookings can be marked as completed or no-show.`,
			);
		}

		const updated = await this.prisma.booking.update({
			where: { id: bookingId },
			data: {
				status: dto.status,
				updatedAt: new Date(),
			},
		});

		const eventType = dto.status === "completed" ? "completed" : "no_show";

		await Promise.all([
			this.auditService.append({
				actorId: actor.id,
				entityType: "booking",
				entityId: bookingId,
				eventType,
				payload: {
					previousStatus: booking.status,
					newStatus: dto.status,
					slotId: booking.slotId,
				},
			}),
			this.notificationsService.notify({
				userId: booking.studentId,
				type:
					dto.status === "completed"
						? "booking_confirmed"
						: "booking_cancelled",
				title:
					dto.status === "completed" ? "Demo Completed" : "No-Show Recorded",
				body:
					dto.status === "completed"
						? `Your demo for "${booking.assignment.title}" has been marked as completed.`
						: `Your demo for "${booking.assignment.title}" has been marked as no-show.`,
				data: {
					bookingId,
					slotId: booking.slotId,
					assignmentId: booking.assignmentId,
					status: dto.status,
				},
				channels: ["inapp", "email"],
			}),
		]);

		return updated;
	}

	private async assertStudentEnrollment(
		tx: Prisma.TransactionClient,
		studentId: string,
		courseId: string,
	) {
		const enrollment = await tx.enrollment.findFirst({
			where: {
				userId: studentId,
				courseId,
				roleInCourse: "student",
			},
		});

		if (!enrollment) {
			throw new ForbiddenException(
				"NOT_ENROLLED",
				"You are not enrolled in this course.",
			);
		}
	}
}
