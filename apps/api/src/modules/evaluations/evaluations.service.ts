import {
	ConflictException,
	ForbiddenException,
	Injectable,
	InternalServerErrorException,
	NotFoundException,
	UnprocessableEntityException,
} from "@nestjs/common";
import { BookingStatus, Evaluation, Prisma, UserRole } from "@prisma/client";
import { PrismaService } from "prisma/prisma.service";
import { isUniqueViolation } from "@/common/prisma.helpers";
import { AuditService } from "@/modules/audit/audit.service";
import { attempt } from "@/utils/attempt.util";
import { CreateEvaluationDto } from "./dto/create-evaluation.dto";
import { QueryEvaluationsDto } from "./dto/query-evaluations.dto";
import { UpdateEvaluationDto } from "./dto/update-evaluation.dto";

// ---------------------------------------------------------------------------
// Reusable include shape — keeps selects DRY across methods
// ---------------------------------------------------------------------------

const EVALUATION_INCLUDES = {
	booking: {
		include: {
			student: {
				select: { id: true, name: true, email: true, rollNumber: true },
			},
			slot: {
				select: { id: true, startsAt: true, endsAt: true, venue: true },
			},
			assignment: { select: { id: true, title: true, courseId: true } },
		},
	},
	ta: { select: { id: true, name: true, email: true } },
} satisfies Prisma.EvaluationInclude;

type EvaluationWithIncludes = Prisma.EvaluationGetPayload<{
	include: typeof EVALUATION_INCLUDES;
}>;

@Injectable()
export class EvaluationsService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly auditService: AuditService,
	) {}

	// ─── Create ───────────────────────────────────────────────────────────────

	async create(
		taId: string,
		dto: CreateEvaluationDto,
	): Promise<EvaluationWithIncludes> {
		// 1. Verify the booking exists and the actor owns the slot
		const [bookingErr, booking] = await attempt(
			this.prisma.booking.findUnique({
				where: { id: dto.bookingId },
				include: { slot: { select: { taId: true } } },
			}),
		);
		if (bookingErr)
			throw new InternalServerErrorException("Failed to fetch booking");
		if (!booking)
			throw new NotFoundException(`Booking ${dto.bookingId} not found`);

		if (booking.slot.taId !== taId) {
			throw new ForbiddenException("You are not the TA for this booking slot");
		}

		// 2. Only completed bookings get evaluated
		if (booking.status !== BookingStatus.completed) {
			throw new UnprocessableEntityException(
				'Evaluations can only be created for bookings with status "completed"',
			);
		}

		// 3. Create — unique index on bookingId prevents duplicates at DB level too
		const [createErr, evaluation] = await attempt(
			this.prisma.evaluation.create({
				data: {
					bookingId: dto.bookingId,
					taId,
					rubricScores: dto.rubricScores ?? {},
					totalScore: dto.totalScore,
					privateNote: dto.privateNote,
				},
				include: EVALUATION_INCLUDES,
			}),
		);

		if (createErr) {
			if (isUniqueViolation(createErr)) {
				throw new ConflictException(
					"An evaluation already exists for this booking",
				);
			}
			throw new InternalServerErrorException("Failed to create evaluation");
		}

		await this.auditService.append({
			actorId: taId,
			entityType: "evaluation",
			entityId: evaluation!.id,
			eventType: "created",
			payload: {
				bookingId: dto.bookingId,
				totalScore: dto.totalScore,
			},
		});

		return evaluation!;
	}

	// ─── Find One ─────────────────────────────────────────────────────────────

	async findOne(
		actorId: string,
		actorRole: UserRole,
		id: string,
	): Promise<EvaluationWithIncludes> {
		const [err, evaluation] = await attempt(
			this.prisma.evaluation.findUnique({
				where: { id },
				include: EVALUATION_INCLUDES,
			}),
		);
		if (err)
			throw new InternalServerErrorException("Failed to fetch evaluation");
		if (!evaluation) throw new NotFoundException(`Evaluation ${id} not found`);

		this.assertReadAccess(evaluation, actorId, actorRole);

		// Strip privateNote for non-TA viewers
		return this.sanitize(evaluation, actorRole);
	}

	// ─── Update ───────────────────────────────────────────────────────────────

	async update(
		actorId: string,
		actorRole: UserRole,
		id: string,
		dto: UpdateEvaluationDto,
	): Promise<EvaluationWithIncludes> {
		const [findErr, evaluation] = await attempt(
			this.prisma.evaluation.findUnique({ where: { id } }),
		);
		if (findErr)
			throw new InternalServerErrorException("Failed to fetch evaluation");
		if (!evaluation) throw new NotFoundException(`Evaluation ${id} not found`);

		if (actorRole !== UserRole.admin && evaluation.taId !== actorId) {
			throw new ForbiddenException("You do not own this evaluation");
		}

		// Admins can override submitted evaluations; TAs cannot
		if (evaluation.submittedAt && actorRole !== UserRole.admin) {
			throw new ForbiddenException(
				"Submitted evaluations are locked. Contact an administrator to request an override.",
			);
		}

		const [updateErr, updated] = await attempt(
			this.prisma.evaluation.update({
				where: { id },
				data: {
					...(dto.rubricScores !== undefined && {
						rubricScores: dto.rubricScores,
					}),
					...(dto.totalScore !== undefined && { totalScore: dto.totalScore }),
					...(dto.privateNote !== undefined && {
						privateNote: dto.privateNote,
					}),
				},
				include: EVALUATION_INCLUDES,
			}),
		);
		if (updateErr)
			throw new InternalServerErrorException("Failed to update evaluation");

		await this.auditService.append({
			actorId,
			entityType: "evaluation",
			entityId: id,
			eventType: "updated",
			payload: {
				fieldsUpdated: Object.keys(dto),
				bookingId: updated!.bookingId,
			},
		});

		return updated!;
	}

	// ─── Submit Batch ─────────────────────────────────────────────────────────

	/**
	 * Atomically marks all unsubmitted evaluations for an assignment as
	 * visible_to_instructor = true and records an audit event.
	 *
	 * TAs can only submit their own evaluations.
	 * Admins can submit any TA's evaluations for the assignment.
	 */
	async submitBatch(
		actorId: string,
		actorRole: UserRole,
		assignmentId: string,
	): Promise<{ submitted: number; submittedAt: Date }> {
		const isAdmin = actorRole === UserRole.admin;

		// Resolve assignment + completed booking IDs for scope
		const [assignErr, assignment] = await attempt(
			this.prisma.assignment.findUnique({
				where: { id: assignmentId },
				select: {
					courseId: true,
					demoSlots: {
						where: isAdmin ? {} : { taId: actorId },
						select: {
							bookings: {
								where: { status: BookingStatus.completed },
								select: { id: true },
							},
						},
					},
				},
			}),
		);
		if (assignErr)
			throw new InternalServerErrorException("Failed to fetch assignment");
		if (!assignment)
			throw new NotFoundException(`Assignment ${assignmentId} not found`);

		if (!isAdmin && assignment.demoSlots.length === 0) {
			throw new ForbiddenException("You are not assigned to this assignment");
		}

		const completedBookingIds = assignment.demoSlots.flatMap((s) =>
			s.bookings.map((b) => b.id),
		);

		if (completedBookingIds.length === 0) {
			throw new UnprocessableEntityException(
				"No completed bookings found for this assignment — nothing to submit",
			);
		}

		// Verify every completed booking already has an evaluation
		const [evalErr, existingEvals] = await attempt(
			this.prisma.evaluation.findMany({
				where: {
					bookingId: { in: completedBookingIds },
					...(isAdmin ? {} : { taId: actorId }),
				},
				select: { id: true, bookingId: true, submittedAt: true },
			}),
		);
		if (evalErr)
			throw new InternalServerErrorException("Failed to fetch evaluations");

		const evaluatedBookingIds = new Set(existingEvals!.map((e) => e.bookingId));
		const unevaluated = completedBookingIds.filter(
			(id) => !evaluatedBookingIds.has(id),
		);

		if (unevaluated.length > 0) {
			throw new UnprocessableEntityException(
				`${unevaluated.length} completed booking(s) are missing evaluations. ` +
					"All completed demos must be evaluated before submission.",
			);
		}

		const pendingIds = existingEvals!
			.filter((e) => !e.submittedAt)
			.map((e) => e.id);

		if (pendingIds.length === 0) {
			throw new ConflictException(
				"All evaluations for this assignment have already been submitted",
			);
		}

		const submittedAt = new Date();

		// Atomic: update evaluations + append audit event in one transaction
		try {
			await this.prisma.$transaction([
				this.prisma.evaluation.updateMany({
					where: { id: { in: pendingIds } },
					data: { visibleToInstructor: true, submittedAt },
				}),
				this.prisma.auditEvent.create({
					data: {
						actorId,
						entityType: "assignment",
						entityId: assignmentId,
						eventType: "evaluation_submitted",
						payload: {
							assignmentId,
							actorId,
							count: pendingIds.length,
							submittedAt: submittedAt.toISOString(),
						},
					},
				}),
			]);
		} catch {
			throw new InternalServerErrorException("Failed to submit evaluations");
		}

		return { submitted: pendingIds.length, submittedAt };
	}

	// ─── Find By Course (Instructor) ──────────────────────────────────────────

	async findByCourse(
		courseId: string,
		query: QueryEvaluationsDto,
	): Promise<Omit<EvaluationWithIncludes, "privateNote">[]> {
		const [err, evaluations] = await attempt(
			this.prisma.evaluation.findMany({
				where: {
					visibleToInstructor: true,
					booking: {
						assignment: {
							courseId,
							...(query.assignmentId ? { id: query.assignmentId } : {}),
						},
					},
				},
				include: EVALUATION_INCLUDES,
				orderBy: [
					{ booking: { assignment: { title: "asc" } } },
					{ submittedAt: "desc" },
				],
			}),
		);
		if (err)
			throw new InternalServerErrorException("Failed to fetch evaluations");

		// privateNote is TA-only — strip before returning to instructors
		const sanitized = evaluations!.map((e) =>
			this.sanitize(e, UserRole.instructor),
		);

		return sanitized;
	}

	// ─── Private Helpers ──────────────────────────────────────────────────────

	private assertReadAccess(
		evaluation: Evaluation,
		actorId: string,
		actorRole: UserRole,
	): void {
		if (actorRole === UserRole.admin) return;

		if (actorRole === UserRole.ta && evaluation.taId !== actorId) {
			throw new ForbiddenException("You do not own this evaluation");
		}

		if (actorRole === UserRole.instructor && !evaluation.visibleToInstructor) {
			throw new ForbiddenException(
				"This evaluation has not been submitted yet",
			);
		}
	}

	/**
	 * Strips `privateNote` for any viewer who is not a TA or admin.
	 * The TA private note is a system-level privacy boundary.
	 */
	private sanitize<T extends Evaluation>(
		evaluation: T,
		role: UserRole,
	): Omit<T, "privateNote"> & { privateNote: string | null } {
		const canSeeNote = role === UserRole.ta || role === UserRole.admin;
		return {
			...evaluation,
			privateNote: canSeeNote ? evaluation.privateNote : null,
		};
	}
}
