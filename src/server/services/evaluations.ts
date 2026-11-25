import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { canReadPrivateNote, canSubmit, canTransition, canWithdraw, checkTotalMarks, computeTotal, nextStatus, releaseAtFor, submitRoute, validateScores, type EvaluationStatus } from "@/domain/evaluation";
import { checkReason } from "@/domain/text";
import { assertRule, DomainError } from "@/domain/result";
import { visibleMarks, type VisibleMarks } from "@/domain/student-demo";
import { dayRange, fmtData } from "@/lib/time";
import { db, type Tx } from "@/server/db";
import { assertAdmin, assertAssignmentRole, assertCourseRole, assertCourseWritable, courseHasInstructor, STAFF, type Actor } from "./access";
import { audit } from "./audit";
import { notify, unseenEarlier } from "./notify";
import { marksKey } from "@/domain/notifications";
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
  /** The saver's own private note (ADR-031); left out, it stays as it is. */
  privateNotes: z.string().trim().max(5000).optional().transform((v) => (v === undefined ? undefined : v || null)),
});

/** A private note as one viewer may see it (`readableNotes`). */
export interface PrivateNote {
  body: string;
  /** Null for a note written before notes had an author. */
  author: string | null;
  mine: boolean;
  updatedAt: Date;
}

/**
 * The private notes the actor may read on these evaluations of one course, by evaluation id:
 * their own, or every note for the course's enrolled instructors (`canReadPrivateNote`). Admins
 * read courses as instructors but aren't enrolled, so they get none. This is the only place
 * notes are read.
 */
export async function readableNotes(tx: Tx, actor: Actor, courseId: string, evaluationIds: string[]): Promise<Map<string, PrivateNote[]>> {
  const byEvaluation = new Map<string, PrivateNote[]>();
  if (evaluationIds.length === 0) return byEvaluation;
  const enrollment = await tx.enrollment.findUnique({ where: { courseId_userId: { courseId, userId: actor.id } }, select: { role: true } });
  const viewer = { id: actor.id, enrolledRole: enrollment?.role ?? null };
  if (viewer.enrolledRole !== "INSTRUCTOR" && viewer.enrolledRole !== "TA") return byEvaluation;
  const notes = await tx.evaluationNote.findMany({
    where: {
      evaluationId: { in: evaluationIds },
      evaluation: { assignment: { courseId } },
      ...(viewer.enrolledRole === "INSTRUCTOR" ? {} : { authorId: actor.id }),
    },
    include: { author: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  for (const n of notes) {
    if (!canReadPrivateNote(n, viewer).ok) continue;
    const list = byEvaluation.get(n.evaluationId) ?? [];
    // The viewer's own note first, so the marking sheet finds it to edit.
    const note = { body: n.body, author: n.author?.name ?? null, mine: n.authorId === actor.id, updatedAt: n.updatedAt };
    if (note.mine) list.unshift(note);
    else list.push(note);
    byEvaluation.set(n.evaluationId, list);
  }
  return byEvaluation;
}

/** Staff view of one student's evaluation (created on first open). */
export async function getOrCreateEvaluation(actor: Actor, assignmentId: string, studentId: string) {
  return db.$transaction(async (tx) => {
    const { assignment } = await assertAssignmentRole(tx, actor, assignmentId, STAFF, { write: true });
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
  const notes = evaluation ? ((await readableNotes(db, actor, assignment.courseId, [evaluation.id])).get(evaluation.id) ?? []) : [];
  return { assignment, criteria, role, hasInstructor, student: enrollment.user, section: enrollment.section, booking, evaluation, notes };
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
  assertCourseWritable(actor, evaluation.assignment.course);
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
  if (total !== null) assertRule(checkTotalMarks(total, maxMarks), "INVALID", "total");
  if (data.totalOverride && criteria.length > 0) {
    assertRule(checkReason(data.overrideNote, { missing: "Add a note explaining the total override." }), "INVALID", "overrideNote");
  }

  const before = await tx.evaluation.findUniqueOrThrow({
    where: { id: evaluation.id },
    select: { totalMarks: true, totalOverride: true, overrideNote: true, feedback: true, scores: { select: { criterionId: true, points: true, comment: true } } },
  });

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
      evaluatorId: actor.id,
    },
  });
  const privateNotesEdited = await writeOwnNote(tx, actor, evaluation.id, data.privateNotes);

  // Every change to marks is audited (drafts, autosaves, edits after unlock), but only when
  // something changed. Private notes are recorded as edited, never their text.
  const snapshot = (e: { totalMarks: number | null; totalOverride: boolean; overrideNote: string | null; feedback: string | null; scores: { criterionId: string; points: number; comment: string | null }[] }) => ({
    total: e.totalMarks,
    totalOverride: e.totalOverride,
    overrideNote: e.overrideNote ?? null,
    feedback: e.feedback ?? null,
    scores: Object.fromEntries([...e.scores].sort((a, b) => a.criterionId.localeCompare(b.criterionId)).map((s) => [s.criterionId, { points: s.points, comment: s.comment ?? null }])),
  });
  const was = snapshot(before);
  const now = snapshot({ totalMarks: total, totalOverride: data.totalOverride, overrideNote: data.overrideNote ?? null, feedback: data.feedback ?? null, scores: data.scores.map((s) => ({ criterionId: s.criterionId, points: s.points, comment: s.comment ?? null })) });
  if (JSON.stringify(was) !== JSON.stringify(now) || privateNotesEdited) {
    await audit(tx, actor, { action: "evaluation.write", entityType: "Evaluation", entityId: evaluation.id, before: was, after: { ...now, ...(privateNotesEdited ? { privateNotesEdited: true } : {}) } });
  }
  return total;
}

/**
 * Set or clear the actor's own private note (ADR-031); nobody else's note is touched, so a TA
 * who can't see a colleague's note can't overwrite it. Returns whether the note changed.
 */
async function writeOwnNote(tx: Tx, actor: Actor, evaluationId: string, body: string | null | undefined): Promise<boolean> {
  if (body === undefined) return false;
  const key = { evaluationId, authorId: actor.id };
  const existing = await tx.evaluationNote.findFirst({ where: key, select: { id: true, body: true } });
  if ((existing?.body ?? null) === body) return false;
  if (body === null) await tx.evaluationNote.delete({ where: { id: existing!.id } });
  else if (existing) await tx.evaluationNote.update({ where: { id: existing.id }, data: { body } });
  else await tx.evaluationNote.create({ data: { ...key, body } });
  return true;
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
  input: z.input<typeof evaluationInput> & { noBookingReason?: string; earlyMarkReason?: string },
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
      if (!booking) assertRule(checkReason(reason, { missing: "This student has no demo booking. Say why you're marking them anyway — it's recorded." }), "INVALID", "noBookingReason");
      evaluation = await tx.evaluation.create({
        data: { assignmentId, studentId, evaluatorId: actor.id, bookingId: booking?.id, noBookingReason: booking ? null : reason },
      });
      if (!booking) {
        await audit(tx, actor, { action: "evaluation.no_booking", entityType: "Evaluation", entityId: evaluation.id, after: { studentId, reason } });
      }
    } else if (booking && evaluation.bookingId !== booking.id) {
      await tx.evaluation.update({ where: { id: evaluation.id }, data: { bookingId: booking.id } });
    }
    // Marking before the demo has happened is unusual: it needs a reason, kept with the marks.
    if (booking && booking.slot.startsAt > now && !evaluation.earlyMarkReason) {
      const reason = input.earlyMarkReason?.trim();
      assertRule(checkReason(reason, { missing: "This demo hasn't started yet. Say why you're marking it early — it's recorded." }), "INVALID", "earlyMarkReason");
      evaluation = await tx.evaluation.update({ where: { id: evaluation.id }, data: { earlyMarkReason: reason } });
      await audit(tx, actor, { action: "evaluation.early", entityType: "Evaluation", entityId: evaluation.id, after: { studentId, reason, demoAt: booking.slot.startsAt } });
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
  const notesBy = await readableNotes(db, actor, assignment.courseId, evaluations.map((e) => e.id));
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
          notes: notesBy.get(e.id) ?? [],
          noBookingReason: e.noBookingReason,
          earlyMarkReason: e.earlyMarkReason,
          reviewComment: e.reviewComment,
          releaseAt: e.releaseAt,
          scores: e.scores.map((s) => ({ criterionId: s.criterionId, points: s.points, comment: s.comment })),
        },
      };
    }),
  };
}

export type MarkingSheet = Awaited<ReturnType<typeof getMarkingSheet>>;

/**
 * Where a link to one booking should open the marking sheet: that booking's
 * day, and everyone's demos when someone else hosts it. Null for a booking
 * outside this assignment.
 */
export async function markingSheetFocus(actor: Actor, assignmentId: string, bookingId: string) {
  const { assignment } = await assertAssignmentRole(db, actor, assignmentId, STAFF);
  const b = await db.booking.findUnique({ where: { id: bookingId }, select: { assignmentId: true, slot: { select: { startsAt: true, taId: true } } } });
  if (!b || b.assignmentId !== assignmentId) return null;
  return { startsAt: b.slot.startsAt, timezone: assignment.course.timezone, hostedByMe: b.slot.taId === actor.id };
}

/**
 * Submit evaluations (`submitRoute`, ADR-032). With an instructor in the course they go to
 * SUBMITTED for review. Without one, a TA's marks are held for 24 hours (`releaseAt`) and the
 * worker releases them (`releaseHeldMarks`); what an instructor submits is final at once.
 */
export async function submitEvaluations(actor: Actor, evaluationIds: string[], now = new Date()) {
  return db.$transaction(async (tx) => {
    const results: { id: string; status: string; releaseAt: Date | null }[] = [];
    for (const id of evaluationIds) {
      const { evaluation, role } = await loadForStaff(tx, actor, id);
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
      const route = submitRoute(role === "INSTRUCTOR" ? "INSTRUCTOR" : "TA", await courseHasInstructor(tx, evaluation.assignment.courseId));
      const status = nextStatus(evaluation.status, "submit", { route });
      const releaseAt = route === "hold" ? releaseAtFor(now) : null;
      await tx.evaluation.update({
        where: { id },
        data: {
          status,
          submittedAt: now,
          submittedById: actor.id,
          releaseAt,
          ...(status === "FINALIZED" ? { reviewedById: actor.id, reviewedAt: now, released: Prisma.DbNull } : {}),
        },
      });
      if (status === "FINALIZED") await announceMarks(tx, evaluation);
      await audit(tx, actor, { action: `evaluation.submit`, entityType: "Evaluation", entityId: id, after: { status, ...(releaseAt ? { releaseAt: releaseAt.toISOString() } : {}) } });
      results.push({ id, status, releaseAt });
    }
    return results;
  });
}

/**
 * Tell the student their marks are out. The email and push say only that, with a link: marks,
 * rubric scores and feedback stay in Uniflow, behind sign-in, and never sit in an inbox, a lock
 * screen or the outbox (#33). Marks released again after a correction say so.
 */
async function announceMarks(tx: Tx, evaluation: { id: string; studentId: string; assignmentId: string; assignment: { title: string; courseId: string } }) {
  const ev = await tx.evaluation.findUniqueOrThrow({
    where: { id: evaluation.id },
    include: { assignment: { include: { course: { select: { code: true } } } } },
  });
  const lastUnlock = await tx.auditLog.findFirst({ where: { action: "evaluation.unlock", entityId: ev.id }, orderBy: { createdAt: "desc" } });
  // A correction made before the student saw the first release is just the release: one item, final marks.
  const unlock = lastUnlock && !(await unseenEarlier(tx, ev.studentId, marksKey(ev.id))) ? lastUnlock : null;
  const { title, course } = ev.assignment;
  await notify(tx, [ev.studentId], {
    type: unlock ? "evaluation.updated" : "evaluation.finalized",
    title: unlock ? `Marks updated: ${title}` : `Marks released: ${title}`,
    body: unlock
      ? `Your marks for ${course.code} — ${title} were corrected. Open Uniflow to see them.`
      : `Your marks for ${course.code} — ${title} are released. Open Uniflow to see them and the feedback.`,
    link: `/courses/${ev.assignment.courseId}/assignments/${ev.assignmentId}`,
    groupKey: marksKey(ev.id),
    // Held briefly so a quick correction replaces it instead of sending two emails.
    emailDelayMinutes: 5,
  });
}

/**
 * Withdraw held marks before they reach the student (ADR-032): only the TA who submitted them.
 * They go back to DRAFT; the student was never told, so nobody is notified.
 */
export async function withdrawEvaluation(actor: Actor, evaluationId: string, now = new Date()) {
  return db.$transaction(async (tx) => {
    const { evaluation } = await loadForStaff(tx, actor, evaluationId);
    const check = canWithdraw(evaluation, { kind: "staff", id: actor.id }, now);
    assertRule(check, evaluation.submittedById !== actor.id && evaluation.releaseAt ? "FORBIDDEN" : "CONFLICT");
    await takeBack(tx, evaluationId, now);
    await audit(tx, actor, { action: "evaluation.withdraw", entityType: "Evaluation", entityId: evaluationId, before: { releaseAt: evaluation.releaseAt!.toISOString() } });
  });
}

/**
 * An admin withdraws held marks from the console, with a reason (ADR-032): a narrow moderation
 * exception to admins being read-only in courses (ADR-025). The submitting TA is told why.
 */
export async function adminWithdrawEvaluation(actor: Actor, evaluationId: string, reason: string, now = new Date()) {
  assertAdmin(actor);
  assertRule(checkReason(reason, { missing: "Say why the marks are being withdrawn; the TA sees it." }), "INVALID", "reason");
  return db.$transaction(async (tx) => {
    const evaluation = await tx.evaluation.findUnique({
      where: { id: evaluationId },
      include: { assignment: { select: { title: true, courseId: true } }, student: { select: { name: true } } },
    });
    if (!evaluation) throw new DomainError("Evaluation not found.", "NOT_FOUND");
    assertRule(canWithdraw(evaluation, { kind: "admin" }, now), "CONFLICT");
    await takeBack(tx, evaluationId, now);
    await audit(tx, actor, {
      action: "evaluation.withdraw",
      entityType: "Evaluation",
      entityId: evaluationId,
      before: { releaseAt: evaluation.releaseAt!.toISOString(), submittedById: evaluation.submittedById },
      after: { reason: reason.trim(), by: "admin" },
    });
    if (evaluation.submittedById) {
      await notify(tx, [evaluation.submittedById], {
        type: "evaluation.withdrawn",
        title: `Marks withdrawn: ${evaluation.assignment.title}`,
        body: `A Uniflow admin withdrew ${evaluation.student.name}'s marks before they were released:\n"${reason.trim()}"`,
        link: `/courses/${evaluation.assignment.courseId}/manage/assignments/${evaluation.assignmentId}/evaluate/${evaluation.studentId}`,
      });
    }
  });
}

/** Every held release across courses, soonest first, for the admin console (ADR-032). */
export async function adminListHeldMarks(actor: Actor) {
  assertAdmin(actor);
  return db.evaluation.findMany({
    where: { status: "SUBMITTED", releaseAt: { not: null } },
    select: {
      id: true,
      releaseAt: true,
      totalMarks: true,
      student: { select: { name: true, email: true } },
      submittedBy: { select: { name: true } },
      assignment: { select: { title: true, maxMarks: true, course: { select: { id: true, code: true, timezone: true } } } },
    },
    orderBy: { releaseAt: "asc" },
    take: 200,
  });
}

/** Held marks back to DRAFT, unless the release won the race. */
async function takeBack(tx: Tx, evaluationId: string, now: Date) {
  const taken = await tx.evaluation.updateMany({
    where: { id: evaluationId, status: "SUBMITTED", releaseAt: { gt: now } },
    data: { status: "DRAFT", releaseAt: null, submittedAt: null, submittedById: null },
  });
  if (taken.count === 0) throw new DomainError("These marks have already been released.", "CONFLICT");
}

/**
 * Release held marks whose time has come (worker, every minute; ADR-032). Each one is claimed
 * with a conditional update, so two runs or two workers never release or notify twice. The
 * submitting TA is recorded as the one who released them, as when a submit was final at once.
 */
export async function releaseHeldMarks(now = new Date()): Promise<number> {
  const due = await db.evaluation.findMany({ where: { status: "SUBMITTED", releaseAt: { lte: now } }, select: { id: true }, orderBy: { releaseAt: "asc" }, take: 200 });
  let released = 0;
  for (const { id } of due) {
    await db.$transaction(async (tx) => {
      const ev = await tx.evaluation.findUniqueOrThrow({ where: { id }, include: { assignment: { select: { title: true, courseId: true } } } });
      const claimed = await tx.evaluation.updateMany({
        where: { id, status: "SUBMITTED", releaseAt: { lte: now }, submittedById: ev.submittedById },
        data: { status: "FINALIZED", releaseAt: null, reviewedById: ev.submittedById, reviewedAt: now, released: Prisma.DbNull },
      });
      if (claimed.count === 0) return;
      await announceMarks(tx, ev);
      await audit(tx, null, { action: "evaluation.release", entityType: "Evaluation", entityId: id, after: { status: "FINALIZED", submittedById: ev.submittedById } });
      released++;
    });
  }
  return released;
}

/**
 * Remove draft marks entirely (e.g. so a marked booking can be moved). Submitted
 * or final marks must be unlocked first. The old marks stay in the audit log.
 */
export async function clearMarks(actor: Actor, evaluationId: string, reason: string) {
  assertRule(checkReason(reason, { missing: "Say why the marks are being cleared." }), "INVALID", "reason");
  return db.$transaction(async (tx) => {
    const { evaluation } = await loadForStaff(tx, actor, evaluationId);
    if (evaluation.status === "SUBMITTED" || evaluation.status === "FINALIZED") throw new DomainError("Unlock these marks before clearing them.", "CONFLICT");
    const scores = await tx.evaluationScore.findMany({ where: { evaluationId } });
    await tx.evaluation.delete({ where: { id: evaluationId } });
    await audit(tx, actor, {
      action: "evaluation.clear",
      entityType: "Evaluation",
      entityId: evaluationId,
      before: { studentId: evaluation.studentId, totalMarks: evaluation.totalMarks, feedback: evaluation.feedback, scores: scores.map((s) => ({ criterionId: s.criterionId, points: s.points })) },
      after: { reason: reason.trim() },
    });
  });
}

/** Instructor review: finalize or return with a comment. */
export async function reviewEvaluation(actor: Actor, evaluationId: string, decision: "finalize" | "return", comment?: string) {
  return db.$transaction(async (tx) => {
    const { evaluation, role } = await loadForStaff(tx, actor, evaluationId);
    if (role !== "INSTRUCTOR") throw new DomainError("Only instructors review submitted evaluations.", "FORBIDDEN");
    assertRule(checkReason(comment, { required: decision === "return", missing: "Tell the TA what needs to change." }), "INVALID", "comment");
    const status = nextStatus(evaluation.status, decision);
    // Conditional, so a held release by the worker (or a second reviewer) can't be finalized twice.
    const reviewed = await tx.evaluation.updateMany({
      where: { id: evaluationId, status: "SUBMITTED" },
      data: { status, releaseAt: null, reviewedById: actor.id, reviewedAt: new Date(), reviewComment: comment?.trim() || null, ...(status === "FINALIZED" ? { released: Prisma.DbNull } : {}) },
    });
    if (reviewed.count === 0) throw new DomainError("These marks were already released or returned.", "CONFLICT");
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
    assertRule(checkReason(reason, { missing: "Give a reason for unlocking." }), "INVALID", "reason");
    const status = nextStatus(evaluation.status, "unlock");
    // Keep what the student was shown, so their result (and any marks question) stays visible during the correction.
    const released = studentView(await tx.evaluation.findUniqueOrThrow({ where: { id: evaluationId }, include: { scores: { include: { criterion: true } }, assignment: true } }));
    await tx.evaluation.update({ where: { id: evaluationId }, data: { status, reviewComment: reason.trim(), released: released as unknown as Prisma.InputJsonValue } });
    await audit(tx, actor, {
      action: "evaluation.unlock",
      entityType: "Evaluation",
      entityId: evaluationId,
      before: { status: "FINALIZED", totalMarks: evaluation.totalMarks },
      after: { reason },
    });
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
/** Submitted evaluations waiting for the instructor (the Review tab's badge). */
export async function pendingReviewCount(actor: Actor, courseId: string) {
  await assertCourseRole(db, actor, courseId, ["INSTRUCTOR"]);
  return db.evaluation.count({ where: { status: "SUBMITTED", assignment: { courseId } } });
}

export async function listReviewQueue(actor: Actor, courseId: string) {
  await assertCourseRole(db, actor, courseId, ["INSTRUCTOR"]);
  const queue = await db.evaluation.findMany({
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
  // Admins pass the instructor check (read-only) but aren't enrolled, so they see no notes.
  const notesBy = await readableNotes(db, actor, courseId, queue.map((e) => e.id));
  return queue.map((e) => ({ ...e, notes: notesBy.get(e.id) ?? [] }));
}

export interface StudentResult {
  totalMarks: number | null;
  maxMarks: number;
  feedback: string | null;
  scores: { label: string; points: number; maxPoints: number; comment: string | null }[];
}

function studentView(evaluation: {
  totalMarks: number | null;
  feedback: string | null;
  assignment: { maxMarks: number };
  scores: { points: number; comment: string | null; criterion: { label: string; maxPoints: number; order: number } }[];
}): StudentResult {
  return {
    totalMarks: evaluation.totalMarks,
    maxMarks: evaluation.assignment.maxMarks,
    feedback: evaluation.feedback,
    scores: [...evaluation.scores]
      .sort((a, b) => a.criterion.order - b.criterion.order)
      .map((s) => ({ label: s.criterion.label, points: s.points, maxPoints: s.criterion.maxPoints, comment: s.comment })),
  };
}

/**
 * What a student may see: only released marks and feedback — never drafts or
 * private notes. While staff correct unlocked marks, the student keeps seeing
 * the marks they were given, flagged as being reviewed.
 */
export async function getMyResult(actor: Actor, assignmentId: string): Promise<(StudentResult & { underReview: boolean }) | null> {
  const evaluation = await db.evaluation.findUnique({
    where: { assignmentId_studentId: { assignmentId, studentId: actor.id } },
    include: { scores: { include: { criterion: true } }, assignment: true },
  });
  if (!evaluation) return null;
  if (evaluation.status === "FINALIZED") return { ...studentView(evaluation), underReview: false };
  if (evaluation.released) return { ...(evaluation.released as unknown as StudentResult), underReview: true };
  return null;
}

/** Released marks per assignment for the signed-in student (totals only, for status badges). */
export async function listMyVisibleMarks(actor: Actor, filter?: { courseId?: string }): Promise<Map<string, VisibleMarks>> {
  const evaluations = await db.evaluation.findMany({
    where: { studentId: actor.id, ...(filter?.courseId ? { assignment: { courseId: filter.courseId } } : {}) },
    select: { assignmentId: true, status: true, totalMarks: true, released: true },
  });
  const marks = new Map<string, VisibleMarks>();
  for (const e of evaluations) {
    const visible = visibleMarks(e);
    if (visible) marks.set(e.assignmentId, visible);
  }
  return marks;
}

/** Finalize several submitted evaluations at once (instructor review queue). */
export async function finalizeMany(actor: Actor, evaluationIds: string[]) {
  for (const id of evaluationIds) await reviewEvaluation(actor, id, "finalize");
  return evaluationIds.length;
}
