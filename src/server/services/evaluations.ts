import { z } from "zod";
import { canSubmit, canTransition, computeTotal, nextStatus, validateScores } from "@/domain/evaluation";
import { assertRule, DomainError } from "@/domain/result";
import { db, type Tx } from "@/server/db";
import { assertAssignmentRole, assertCourseRole, courseHasInstructor, STAFF, type Actor } from "./access";
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
  return { evaluation, role };
}

export async function saveEvaluation(actor: Actor, evaluationId: string, input: z.input<typeof evaluationInput>) {
  const data = evaluationInput.parse(input);
  return db.$transaction(async (tx) => {
    const { evaluation } = await loadForStaff(tx, actor, evaluationId);
    assertRule(canTransition(evaluation.status, "save"));
    const { criteria, maxMarks } = evaluation.assignment;
    assertRule(validateScores(data.scores, criteria));

    const useRubricSum = criteria.length > 0 && !data.totalOverride;
    const total = useRubricSum ? (data.scores.length ? computeTotal(data.scores) : null) : data.totalMarks;
    if (total !== null && (total < 0 || total > maxMarks)) throw new DomainError(`Total must be between 0 and ${maxMarks}.`);
    if (data.totalOverride && criteria.length > 0 && !data.overrideNote) {
      throw new DomainError("Add a note explaining the total override.");
    }

    await tx.evaluationScore.deleteMany({ where: { evaluationId } });
    if (data.scores.length) {
      await tx.evaluationScore.createMany({ data: data.scores.map((s) => ({ ...s, evaluationId })) });
    }
    await tx.evaluation.update({
      where: { id: evaluationId },
      data: {
        totalMarks: total,
        totalOverride: data.totalOverride,
        overrideNote: data.overrideNote,
        feedback: data.feedback,
        privateNotes: data.privateNotes,
        evaluatorId: actor.id,
      },
    });
    return loadEvaluation(tx, evaluationId);
  });
}

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
