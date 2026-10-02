import { z } from "zod";
import { canSubmit, canTransition, computeTotal, nextStatus, validateScores, type EvaluationStatus } from "@/domain/evaluation";
import { assertRule, DomainError } from "@/domain/result";
import { dayRange, fmtData } from "@/lib/time";
import { db, type Tx } from "@/server/db";
import { assertAssignmentRole, assertCourseRole, assertCourseWritable, courseHasInstructor, STAFF, type Actor } from "./access";
import { audit } from "./audit";
import { notify } from "./notify";
import { ACTIVE_BOOKING } from "./slots";

export const evaluationInput = z.object({
  scores: z.array(
    z.object({
      criterionId: z.string(),
      points: z.coerce.number(),
      comment: z.string().trim().max(1000).optional().transform((v) => v || null),
    }),
  ),
  /** Only used when there is no rubric, or when overriding the rubric sum. */
  totalMarks: z.coerce.number().nullable(),
  totalOverride: z.boolean().default(false),
  overrideNote: z.string().trim().max(1000).optional().transform((v) => v || null),
  feedback: z.string().trim().max(5000).optional().transform((v) => v || null),
  privateNotes: z.string().trim().max(5000).optional().transform((v) => v || null),
});

/** Staff view of one student's evaluation (created on first open). */
export async function getOrCreateEvaluation(actor: Actor, assignmentId: string, studentId: string) {
  return db.$transaction(async (tx) => {
    const { assignment } = await assertAssignmentRole(tx, actor, assignmentId, STAFF);
    const enrollment = await tx.enrollment.findUnique({
      where: { courseId_userId: { courseId: assignment.courseId, userId: studentId } },
    });
    if (!enrollment || enrollment.role !== "STUDENT") throw new DomainError("Student not found in this course.", "NOT_FOUND");
    const booking = await tx.booking.findFirst({
      where: { assignmentId, studentId, status: { in: [...ACTIVE_BOOKING] } },
    });
    const evaluation = await tx.evaluation.upsert({
      where: { assignmentId_studentId: { assignmentId, studentId } },
      create: { assignmentId, studentId, evaluatorId: actor.id, bookingId: booking?.id },
      update: booking ? { bookingId: booking.id } : {},
    });
    return loadEvaluation(tx, evaluation.id);
  });
}

/**
 * One student's record for an assignment (staff view): their booking and, if
 * marking has started, the evaluation. Viewing never creates anything.
 */
export async function getStudentRecord(actor: Actor, assignmentId: string, studentId: string) {
  const { assignment, role } = await assertAssignmentRole(db, actor, assignmentId, STAFF);
  const enrollment = await db.enrollment.findUnique({
    where: { courseId_userId: { courseId: assignment.courseId, userId: studentId } },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  if (!enrollment || enrollment.role !== "STUDENT") throw new DomainError("Student not found in this course.", "NOT_FOUND");
  const [criteria, booking, evaluation, hasInstructor] = await Promise.all([
    db.rubricCriterion.findMany({ where: { assignmentId }, orderBy: { order: "asc" } }),
    db.booking.findFirst({ where: { assignmentId, studentId, status: { in: [...ACTIVE_BOOKING] } }, include: { slot: { include: { venue: true } } } }),
    db.evaluation.findUnique({
      where: { assignmentId_studentId: { assignmentId, studentId } },
      include: { scores: true, evaluator: { select: { name: true } }, reviewedBy: { select: { name: true } } },
    }),
    courseHasInstructor(db, assignment.courseId),
  ]);
  return { assignment, criteria, role, hasInstructor, student: enrollment.user, section: enrollment.section, booking, evaluation };
}

function loadEvaluation(tx: Tx, id: string) {
  return tx.evaluation.findUniqueOrThrow({
    where: { id },
    include: {
      scores: true,
      student: { select: { id: true, name: true, email: true } },
      evaluator: { select: { id: true, name: true } },
      reviewedBy: { select: { id: true, name: true } },
      booking: { include: { slot: { include: { venue: true } } } },
      assignment: { include: { course: true, criteria: { orderBy: { order: "asc" } } } },
    },
  });
}

async function loadForStaff(tx: Tx, actor: Actor, evaluationId: string) {
  const evaluation = await tx.evaluation.findUnique({
    where: { id: evaluationId },
    include: { assignment: { include: { course: true, criteria: true } } },
  });
  if (!evaluation) throw new DomainError("Evaluation not found.", "NOT_FOUND");
  const role = await assertCourseRole(tx, actor, evaluation.assignment.courseId, STAFF);
  // Every caller changes the evaluation, so archived courses are read-only here.
  assertCourseWritable(evaluation.assignment.course);
  return { evaluation, role };
}

export async function saveEvaluation(actor: Actor, evaluationId: string, input: z.input<typeof evaluationInput>) {
  const data = evaluationInput.parse(input);
  return db.$transaction(async (tx) => {
    const { evaluation } = await loadForStaff(tx, actor, evaluationId);
    await writeEvaluation(tx, actor, evaluation, data);
    return loadEvaluation(tx, evaluationId);
  });
}

/** Replace an editable evaluation's scores, total and comments. Returns the stored total. */
async function writeEvaluation(
  tx: Tx,
  actor: Actor,
  evaluation: { id: string; status: EvaluationStatus; assignment: { maxMarks: number; criteria: { id: string; label: string; maxPoints: number }[] } },
  data: z.output<typeof evaluationInput>,
) {
  assertRule(canTransition(evaluation.status, "save"));
  const { criteria, maxMarks } = evaluation.assignment;
  assertRule(validateScores(data.scores, criteria));

  const useRubricSum = criteria.length > 0 && !data.totalOverride;
  const total = useRubricSum ? (data.scores.length ? computeTotal(data.scores) : null) : data.totalMarks;
  if (total !== null && (total < 0 || total > maxMarks)) throw new DomainError(`Total must be between 0 and ${maxMarks}.`);
  if (data.totalOverride && criteria.length > 0 && !data.overrideNote) {
    throw new DomainError("Add a note explaining the total override.");
  }

  await tx.evaluationScore.deleteMany({ where: { evaluationId: evaluation.id } });
  if (data.scores.length) {
    await tx.evaluationScore.createMany({ data: data.scores.map((s) => ({ ...s, evaluationId: evaluation.id })) });
  }
  await tx.evaluation.update({
    where: { id: evaluation.id },
    data: {
      totalMarks: total,
      totalOverride: data.totalOverride,
      overrideNote: data.overrideNote,
      feedback: data.feedback,
      privateNotes: data.privateNotes,
      evaluatorId: actor.id,
    },
  });
  return total;
}

/**
 * Autosave from the marking sheet: create the evaluation on the first save and
 * store a draft. Scoring a student who is booked and whose demo has started
 * records them as present. Marking someone with no booking is unusual, so it
 * needs a reason, which is kept on the evaluation and in the audit log.
 */
export async function saveDraft(
  actor: Actor,
  assignmentId: string,
  studentId: string,
  input: z.input<typeof evaluationInput> & { noBookingReason?: string },
  now = new Date(),
) {
  const data = evaluationInput.parse(input);
  return db.$transaction(async (tx) => {
    const { assignment } = await assertAssignmentRole(tx, actor, assignmentId, STAFF, { write: true });
    const enrollment = await tx.enrollment.findUnique({ where: { courseId_userId: { courseId: assignment.courseId, userId: studentId } } });
    if (!enrollment || enrollment.role !== "STUDENT") throw new DomainError("Student not found in this course.", "NOT_FOUND");
    const booking = await tx.booking.findFirst({ where: { assignmentId, studentId, status: { in: [...ACTIVE_BOOKING] } }, include: { slot: true } });
    if (booking?.status === "NO_SHOW") throw new DomainError("This student was marked as a no-show. Undo that first if they did their demo.");

    let evaluation = await tx.evaluation.findUnique({ where: { assignmentId_studentId: { assignmentId, studentId } } });
    if (!evaluation) {
      const reason = input.noBookingReason?.trim();
      if (!booking && !reason) throw new DomainError("This student has no demo booking. Say why you're marking them anyway — it's recorded.");
      evaluation = await tx.evaluation.create({
        data: { assignmentId, studentId, evaluatorId: actor.id, bookingId: booking?.id, noBookingReason: booking ? null : reason },
      });
      if (!booking) {
        await audit(tx, actor, { action: "evaluation.no_booking", entityType: "Evaluation", entityId: evaluation.id, after: { studentId, reason } });
      }
    } else if (booking && evaluation.bookingId !== booking.id) {
      await tx.evaluation.update({ where: { id: evaluation.id }, data: { bookingId: booking.id } });
    }

    const criteria = await tx.rubricCriterion.findMany({ where: { assignmentId } });
    const totalMarks = await writeEvaluation(tx, actor, { ...evaluation, assignment: { maxMarks: assignment.maxMarks, criteria } }, data);

    let bookingStatus = booking?.status ?? null;
    if (booking?.status === "BOOKED" && booking.slot.startsAt <= now && data.scores.length > 0) {
      await tx.booking.update({ where: { id: booking.id }, data: { status: "COMPLETED" } });
      await audit(tx, actor, { action: "booking.attendance", entityType: "Booking", entityId: booking.id, before: "BOOKED", after: "COMPLETED" });
      bookingStatus = "COMPLETED";
    }
    return { evaluationId: evaluation.id, status: evaluation.status, totalMarks, bookingStatus };
  });
}

export type SheetScope = "mine" | "everyone";

/**
 * The marking sheet for one assignment: the demos of one day (the TA's own by
 * default), or every attended demo whose marks aren't finished (`todo`), or a
 * single student (who may not have booked). Each row carries what the sheet
 * needs to edit it in place.
 */
export async function getMarkingSheet(
  actor: Actor,
  assignmentId: string,
  opts: { day?: string; todo?: boolean; studentId?: string; scope?: SheetScope } = {},
) {
  const { assignment, role } = await assertAssignmentRole(db, actor, assignmentId, STAFF);
  const range = dayRange(opts.day ?? fmtData(new Date(), assignment.course.timezone, "yyyy-MM-dd"), assignment.course.timezone);
  const [criteria, hasInstructor] = await Promise.all([
    db.rubricCriterion.findMany({ where: { assignmentId }, orderBy: { order: "asc" } }),
    courseHasInstructor(db, assignment.courseId),
  ]);
  const host = opts.scope === "everyone" ? {} : { taId: actor.id };

  const bookingWhere = opts.studentId
    ? { assignmentId, studentId: opts.studentId, status: { in: [...ACTIVE_BOOKING] } }
    : opts.todo
      ? { assignmentId, status: "COMPLETED" as const, slot: host, OR: [{ evaluation: null }, { evaluation: { status: { in: ["DRAFT" as const, "RETURNED" as const] } } }] }
      : { assignmentId, status: { in: [...ACTIVE_BOOKING] }, slot: { ...host, status: { not: "CANCELLED" as const }, startsAt: { gte: range.start, lt: range.end } } };
  const bookings = await db.booking.findMany({
    where: bookingWhere,
    include: { student: { select: { id: true, name: true, email: true } }, slot: { include: { venue: { select: { name: true } }, ta: { select: { name: true } } } } },
    orderBy: [{ slot: { startsAt: "asc" } }, { createdAt: "asc" }],
  });

  let rows: { booking: (typeof bookings)[number] | null; student: { id: string; name: string; email: string } }[] = bookings.map((b) => ({ booking: b, student: b.student }));
  if (opts.studentId && rows.length === 0) {
    const enrollment = await db.enrollment.findUnique({
      where: { courseId_userId: { courseId: assignment.courseId, userId: opts.studentId } },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    if (!enrollment || enrollment.role !== "STUDENT") throw new DomainError("Student not found in this course.", "NOT_FOUND");
    rows = [{ booking: null, student: enrollment.user }];
  }

  const evaluations = await db.evaluation.findMany({
    where: { assignmentId, studentId: { in: rows.map((r) => r.student.id) } },
    include: { scores: true, reviewedBy: { select: { name: true } } },
  });
  const evalBy = new Map(evaluations.map((e) => [e.studentId, e]));
  return {
    assignment: { id: assignment.id, title: assignment.title, maxMarks: assignment.maxMarks, courseId: assignment.courseId, course: assignment.course },
    criteria,
    role,
    hasInstructor,
    rows: rows.map((r) => {
      const e = evalBy.get(r.student.id) ?? null;
      return {
        student: r.student,
        booking: r.booking && {
          id: r.booking.id,
          status: r.booking.status,
          startsAt: r.booking.slot.startsAt,
          endsAt: r.booking.slot.endsAt,
          venue: r.booking.slot.venue?.name ?? null,
          host: r.booking.slot.ta.name,
        },
        evaluation: e && {
          id: e.id,
          status: e.status,
          totalMarks: e.totalMarks,
          totalOverride: e.totalOverride,
          overrideNote: e.overrideNote,
          feedback: e.feedback,
          privateNotes: e.privateNotes,
          noBookingReason: e.noBookingReason,
          reviewComment: e.reviewComment,
          scores: e.scores.map((s) => ({ criterionId: s.criterionId, points: s.points, comment: s.comment })),
        },
      };
    }),
  };
}

export type MarkingSheet = Awaited<ReturnType<typeof getMarkingSheet>>;

/**
 * Submit evaluations. With an instructor in the course they go to SUBMITTED for
 * review; without one, the TA's submission is final.
 */
export async function submitEvaluations(actor: Actor, evaluationIds: string[]) {
  return db.$transaction(async (tx) => {
    const results: { id: string; status: string }[] = [];
    for (const id of evaluationIds) {
      const { evaluation } = await loadForStaff(tx, actor, id);
      assertRule(canTransition(evaluation.status, "submit"));
      const scores = await tx.evaluationScore.findMany({ where: { evaluationId: id } });
      const check = canSubmit({
        criteria: evaluation.assignment.criteria,
        scores,
        totalMarks: evaluation.totalMarks,
        maxMarks: evaluation.assignment.maxMarks,
      });
      if (!check.ok) {
        const student = await tx.user.findUniqueOrThrow({ where: { id: evaluation.studentId } });
        throw new DomainError(`${student.name}: ${check.reason}`);
      }
      const hasInstructor = await courseHasInstructor(tx, evaluation.assignment.courseId);
      const status = nextStatus(evaluation.status, "submit", { courseHasInstructor: hasInstructor });
      await tx.evaluation.update({
        where: { id },
        data: {
          status,
          submittedAt: new Date(),
          ...(status === "FINALIZED" ? { reviewedById: actor.id, reviewedAt: new Date() } : {}),
        },
      });
      if (status === "FINALIZED") await announceMarks(tx, evaluation);
      await audit(tx, actor, { action: `evaluation.submit`, entityType: "Evaluation", entityId: id, after: { status } });
      results.push({ id, status });
    }
    return results;
  });
}

async function announceMarks(tx: Tx, evaluation: { studentId: string; assignmentId: string; assignment: { title: string; courseId: string } }) {
  await notify(tx, [evaluation.studentId], {
    type: "evaluation.finalized",
    title: `Marks released: ${evaluation.assignment.title}`,
    body: `Your demo for ${evaluation.assignment.title} has been marked. Open Slotty to see your result and feedback.`,
    link: `/courses/${evaluation.assignment.courseId}/assignments/${evaluation.assignmentId}`,
  });
}

/** Instructor review: finalize or return with a comment. */
export async function reviewEvaluation(actor: Actor, evaluationId: string, decision: "finalize" | "return", comment?: string) {
  return db.$transaction(async (tx) => {
    const { evaluation, role } = await loadForStaff(tx, actor, evaluationId);
    if (role !== "INSTRUCTOR") throw new DomainError("Only instructors review submitted evaluations.", "FORBIDDEN");
    if (decision === "return" && !comment?.trim()) throw new DomainError("Tell the TA what needs to change.");
    const status = nextStatus(evaluation.status, decision, { courseHasInstructor: true });
    await tx.evaluation.update({
      where: { id: evaluationId },
      data: { status, reviewedById: actor.id, reviewedAt: new Date(), reviewComment: comment?.trim() || null },
    });
    if (decision === "finalize") {
      await announceMarks(tx, evaluation);
    } else {
      await notify(tx, [evaluation.evaluatorId], {
        type: "evaluation.returned",
        title: `Evaluation returned: ${evaluation.assignment.title}`,
        body: `${actor.name} returned an evaluation for changes:\n"${comment!.trim()}"`,
        link: `/courses/${evaluation.assignment.courseId}/manage/assignments/${evaluation.assignmentId}/evaluate/${evaluation.studentId}`,
      });
    }
    await audit(tx, actor, { action: `evaluation.${decision}`, entityType: "Evaluation", entityId: evaluationId, after: { comment } });
  });
}

/**
 * Reopen a finalized evaluation for correction. Instructors can always do this;
 * TAs only in courses without an instructor (where they finalized it themselves).
 */
export async function unlockEvaluation(actor: Actor, evaluationId: string, reason: string) {
  return db.$transaction(async (tx) => {
    const { evaluation, role } = await loadForStaff(tx, actor, evaluationId);
    if (role !== "INSTRUCTOR" && (await courseHasInstructor(tx, evaluation.assignment.courseId))) {
      throw new DomainError("Ask the course instructor to unlock this evaluation.", "FORBIDDEN");
    }
    if (!reason.trim()) throw new DomainError("Give a reason for unlocking.");
    const status = nextStatus(evaluation.status, "unlock", { courseHasInstructor: true });
    await tx.evaluation.update({ where: { id: evaluationId }, data: { status, reviewComment: reason.trim() } });
    await audit(tx, actor, { action: "evaluation.unlock", entityType: "Evaluation", entityId: evaluationId, before: "FINALIZED", after: { reason } });
  });
}

/**
 * Every student in the course with their booking + evaluation for one assignment
 * (the staff marking roster, including students who never booked).
 */
export async function listAssignmentRoster(actor: Actor, assignmentId: string) {
  const { assignment } = await assertAssignmentRole(db, actor, assignmentId, STAFF);
  const [students, bookings, evaluations] = await Promise.all([
    db.enrollment.findMany({
      where: { courseId: assignment.courseId, role: "STUDENT" },
      include: { user: { select: { id: true, name: true, email: true, status: true } } },
      orderBy: { user: { name: "asc" } },
    }),
    db.booking.findMany({
      where: { assignmentId, status: { in: [...ACTIVE_BOOKING] } },
      include: { slot: { include: { venue: true, ta: { select: { id: true, name: true } } } } },
    }),
    db.evaluation.findMany({ where: { assignmentId }, include: { evaluator: { select: { name: true } } } }),
  ]);
  const bookingBy = new Map(bookings.map((b) => [b.studentId, b]));
  const evalBy = new Map(evaluations.map((e) => [e.studentId, e]));
  return students.map((s) => ({
    student: s.user,
    section: s.section,
    booking: bookingBy.get(s.userId) ?? null,
    evaluation: evalBy.get(s.userId) ?? null,
  }));
}

/** Evaluations awaiting instructor review in a course. */
export async function listReviewQueue(actor: Actor, courseId: string) {
  await assertCourseRole(db, actor, courseId, ["INSTRUCTOR"]);
  return db.evaluation.findMany({
    where: { status: "SUBMITTED", assignment: { courseId } },
    include: {
      student: { select: { id: true, name: true, email: true } },
      evaluator: { select: { name: true } },
      assignment: { include: { criteria: { orderBy: { order: "asc" } } } },
      scores: true,
      booking: { select: { status: true } },
    },
    orderBy: { submittedAt: "asc" },
  });
}

/** What a student may see: only finalized marks and feedback — never private notes. */
export async function getMyResult(actor: Actor, assignmentId: string) {
  const evaluation = await db.evaluation.findUnique({
    where: { assignmentId_studentId: { assignmentId, studentId: actor.id } },
    include: { scores: { include: { criterion: true } }, assignment: true },
  });
  if (!evaluation || evaluation.status !== "FINALIZED") return null;
  return {
    totalMarks: evaluation.totalMarks,
    maxMarks: evaluation.assignment.maxMarks,
    feedback: evaluation.feedback,
    scores: evaluation.scores
      .sort((a, b) => a.criterion.order - b.criterion.order)
      .map((s) => ({ label: s.criterion.label, points: s.points, maxPoints: s.criterion.maxPoints, comment: s.comment })),
  };
}

/** Finalize several submitted evaluations at once (instructor review queue). */
export async function finalizeMany(actor: Actor, evaluationIds: string[]) {
  for (const id of evaluationIds) await reviewEvaluation(actor, id, "finalize");
  return evaluationIds.length;
}
