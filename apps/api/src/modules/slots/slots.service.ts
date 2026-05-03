import { Injectable } from "@nestjs/common";
import { Assignment, Prisma, SlotStatus, User } from "@prisma/client";
import { PrismaService } from "prisma/prisma.service";
import {
	BadRequestException,
	ForbiddenException,
	NotFoundException,
} from "@/common/exceptions/business.exception";
import { AuditService } from "@/modules/audit/audit.service";
import { NotificationsService } from "@/modules/notifications/notifications.service";
import { GenerateSlotsDto } from "./dto/generate-slots.dto.js";
import { ListSlotsQueryDto } from "./dto/list-slots-query.dto.js";
import { UpdateSlotDto } from "./dto/update-slot.dto.js";

@Injectable()
export class SlotsService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly auditService: AuditService,
		private readonly notificationsService: NotificationsService,
	) {}

	async generateSlots(
		assignmentId: string,
		dto: GenerateSlotsDto,
		actor: User,
	) {
		const assignment = await this.prisma.assignment.findUnique({
			where: { id: assignmentId },
		});
		if (!assignment) {
			throw new NotFoundException("Assignment not found.");
		}

		await this.assertAssignmentAccess(assignment, actor);

		const ta = await this.prisma.user.findUnique({
			where: { id: dto.ta_id },
		});
		if (!ta) {
			throw new NotFoundException("TA user not found.");
		}
		if (ta.role !== "ta") {
			throw new BadRequestException(
				"INVALID_TA_ROLE",
				"Slot owner must be a TA.",
			);
		}
		if (actor.role === "ta" && ta.id !== actor.id) {
			throw new ForbiddenException(
				"SLOT_ACCESS_DENIED",
				"TAs can only create their own slots.",
			);
		}
		await this.assertTaEnrollment(ta.id, assignment.courseId);

		if (assignment.demoWindowEnd <= assignment.demoWindowStart) {
			throw new BadRequestException(
				"INVALID_DEMO_WINDOW",
				"Demo window end must be after start.",
			);
		}

		const durationMs = assignment.slotDurationMin * 60 * 1000;
		if (durationMs <= 0) {
			throw new BadRequestException(
				"INVALID_SLOT_DURATION",
				"Slot duration must be greater than zero.",
			);
		}

		const slotsData: Prisma.DemoSlotCreateManyInput[] = [];
		let cursor = new Date(assignment.demoWindowStart);
		const windowEnd = new Date(assignment.demoWindowEnd);

		while (cursor.getTime() + durationMs <= windowEnd.getTime()) {
			const endsAt = new Date(cursor.getTime() + durationMs);
			slotsData.push({
				assignmentId: assignment.id,
				taId: ta.id,
				startsAt: new Date(cursor),
				endsAt,
				venue: assignment.defaultVenue ?? null,
				capacity: assignment.slotCapacity,
				status: SlotStatus.draft,
				version: 1,
			});
			cursor = endsAt;
		}

		if (slotsData.length === 0) {
			return { slots: [], count: 0 };
		}

		const saved = await this.prisma.demoSlot.createManyAndReturn({
			data: slotsData,
		});

		await Promise.all(
			saved.map((slot) =>
				this.auditService.append({
					actorId: actor.id,
					entityType: "slot",
					entityId: slot.id,
					eventType: "created",
					payload: {
						assignmentId: assignment.id,
						taId: ta.id,
						startsAt: slot.startsAt.toISOString(),
						endsAt: slot.endsAt.toISOString(),
						venue: slot.venue,
						capacity: slot.capacity,
					},
				}),
			),
		);

		return { slots: saved, count: saved.length };
	}

	async listSlots(assignmentId: string, query: ListSlotsQueryDto, actor: User) {
		const assignment = await this.prisma.assignment.findUnique({
			where: { id: assignmentId },
		});
		if (!assignment) {
			throw new NotFoundException("Assignment not found.");
		}

		await this.assertAssignmentAccess(assignment, actor);

		const where: Prisma.DemoSlotWhereInput = { assignmentId };

		if (actor.role === "student") {
			where.status = SlotStatus.published;
		} else if (actor.role === "ta") {
			where.taId = actor.id;
			if (query.status) {
				where.status = query.status as SlotStatus;
			}
		} else if (query.status) {
			where.status = query.status as SlotStatus;
		}

		if (query.date) {
			const dayStart = new Date(`${query.date}T00:00:00Z`);
			if (Number.isNaN(dayStart.getTime())) {
				throw new BadRequestException(
					"INVALID_DATE_FORMAT",
					"Invalid date format. Use YYYY-MM-DD.",
				);
			}
			where.startsAt = {
				gte: dayStart,
				lte: new Date(`${query.date}T23:59:59.999Z`),
			};
		}

		const slots = await this.prisma.demoSlot.findMany({
			where,
			orderBy: { startsAt: "asc" },
		});

		return { slots, meta: { total: slots.length } };
	}

	async updateSlot(slotId: string, dto: UpdateSlotDto, actor: User) {
		if (dto.status === undefined && dto.venue === undefined) {
			throw new BadRequestException("NOTHING_TO_UPDATE", "Nothing to update.");
		}

		const slot = await this.prisma.demoSlot.findUnique({
			where: { id: slotId },
			include: {
				bookings: {
					where: { status: "booked" },
					include: { student: true },
				},
			},
		});
		if (!slot) {
			throw new NotFoundException("Slot not found.");
		}

		if (actor.role === "ta" && slot.taId !== actor.id) {
			throw new ForbiddenException(
				"SLOT_ACCESS_DENIED",
				"You do not have permission to update this slot.",
			);
		}

		const data: Prisma.DemoSlotUpdateInput = {};
		const auditPayloads: Array<{
			eventType: string;
			payload: Record<string, unknown>;
		}> = [];
		const notifications: Array<{
			userId: string;
			type: string;
			title: string;
			body: string;
			data: Record<string, unknown>;
		}> = [];

		if (dto.status !== undefined) {
			const newStatus = dto.status as SlotStatus;

			if (newStatus === SlotStatus.published) {
				if (!slot.venue || slot.venue.trim().length === 0) {
					throw new BadRequestException(
						"MISSING_VENUE",
						"A venue must be set before publishing a slot.",
					);
				}
			}

			data.status = newStatus;

			if (
				newStatus === SlotStatus.published &&
				slot.status === SlotStatus.draft
			) {
				auditPayloads.push({
					eventType: "published",
					payload: {
						previousStatus: slot.status,
						newStatus: newStatus,
						venue: slot.venue,
					},
				});
			} else if (
				newStatus === SlotStatus.draft &&
				slot.status === SlotStatus.published
			) {
				auditPayloads.push({
					eventType: "unpublished",
					payload: {
						previousStatus: slot.status,
						newStatus: newStatus,
					},
				});
			} else {
				auditPayloads.push({
					eventType: "updated",
					payload: {
						previousStatus: slot.status,
						newStatus: newStatus,
					},
				});
			}
		}

		if (dto.venue !== undefined) {
			const nextVenue = dto.venue.trim();
			if (nextVenue.length === 0) {
				throw new BadRequestException("EMPTY_VENUE", "Venue cannot be empty.");
			}
			if (slot.venue !== nextVenue) {
				data.venue = nextVenue;
				data.version = { increment: 1 };
				auditPayloads.push({
					eventType: "venue_changed",
					payload: {
						oldVenue: slot.venue,
						newVenue: nextVenue,
						previousVersion: slot.version,
					},
				});

				if (
					slot.status === SlotStatus.published ||
					slot.status === SlotStatus.booked
				) {
					for (const booking of slot.bookings) {
						notifications.push({
							userId: booking.studentId,
							type: "venue_changed",
							title: "Venue Changed",
							body: `The venue for your demo slot has been changed from "${slot.venue ?? "TBD"}" to "${nextVenue}".`,
							data: {
								slotId: slot.id,
								bookingId: booking.id,
								oldVenue: slot.venue,
								newVenue: nextVenue,
								startsAt: slot.startsAt.toISOString(),
							},
						});
					}
				}
			}
		}

		const updated = await this.prisma.demoSlot.update({
			where: { id: slotId },
			data,
		});

		await Promise.all([
			...auditPayloads.map(({ eventType, payload }) =>
				this.auditService.append({
					actorId: actor.id,
					entityType: "slot",
					entityId: slotId,
					eventType,
					payload,
				}),
			),
			...notifications.map((n) =>
				this.notificationsService.notify({
					userId: n.userId,
					type: n.type as "venue_changed",
					title: n.title,
					body: n.body,
					data: n.data,
					channels: ["inapp", "email"],
				}),
			),
		]);

		return { slot: updated };
	}

	private async assertAssignmentAccess(
		assignment: Assignment,
		actor: User,
	): Promise<void> {
		if (actor.role === "admin") return;

		if (actor.role === "instructor") {
			if (!(await this.isCourseOwner(assignment.courseId, actor.id))) {
				throw new ForbiddenException(
					"COURSE_ACCESS_DENIED",
					"You do not have permission to access this course.",
				);
			}
			return;
		}

		if (actor.role === "ta") {
			await this.assertTaEnrollment(actor.id, assignment.courseId);
			return;
		}

		if (actor.role === "student") {
			await this.assertStudentEnrollment(actor.id, assignment.courseId);
			return;
		}

		throw new ForbiddenException("ACCESS_DENIED", "Forbidden.");
	}

	private async assertStudentEnrollment(
		userId: string,
		courseId: string,
	): Promise<void> {
		const enrollment = await this.prisma.enrollment.findFirst({
			where: { userId, courseId, roleInCourse: "student" },
		});
		if (!enrollment) {
			throw new ForbiddenException(
				"NOT_ENROLLED",
				"You are not enrolled in this course.",
			);
		}
	}

	private async assertTaEnrollment(
		userId: string,
		courseId: string,
	): Promise<void> {
		const enrollment = await this.prisma.enrollment.findFirst({
			where: { userId, courseId, roleInCourse: "ta" },
		});
		if (!enrollment) {
			throw new ForbiddenException(
				"NOT_ASSIGNED_AS_TA",
				"You are not assigned as a TA in this course.",
			);
		}
	}

	private async isCourseOwner(
		courseId: string,
		userId: string,
	): Promise<boolean> {
		const course = await this.prisma.course.findFirst({
			where: { id: courseId, ownerId: userId },
		});
		return Boolean(course);
	}
}
