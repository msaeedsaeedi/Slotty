import { z } from "zod";
import { DomainError } from "@/domain/result";
import { fmt } from "@/lib/time";
import { db, type Tx } from "@/server/db";
import { assertAssignmentRole, assertCourseRole, assertStaff, STAFF, type Actor } from "./access";
import { audit } from "./audit";
import { notify } from "./notify";

const criterionInput = z.object({
  label: z.string().trim().min(1, "Each rubric row needs a label.").max(120),
  maxPoints: z.coerce.number().positive("Rubric points must be positive.").max(10_000),
});

export const policyInput = z
  .object({
    windowStart: z.date(),
    windowEnd: z.date(),
    slotDurationMin: z.coerce.number().int().min(5, "Slots must be at least 5 minutes.").max(480),
    bufferMin: z.coerce.number().int().min(0).max(240),
    capacityPerSlot: z.coerce.number().int().min(1).max(100),
    bookingOpensAt: z.date().nullable(),
    freezeHours: z.coerce.number().int().min(0).max(24 * 14),
    maxReschedules: z.coerce.number().int().min(0).max(20),
    allowStudentCancel: z.boolean(),
  })
  .refine((p) => p.windowEnd > p.windowStart, { message: "The demo window must end after it starts.", path: ["windowEnd"] })
  .refine((p) => !p.bookingOpensAt || p.bookingOpensAt < p.windowEnd, {
    message: "Booking must open before the demo window ends.",
    path: ["bookingOpensAt"],
  });

export const assignmentInput = z
  .object({
    title: z.string().trim().min(1, "Title is required.").max(200),
    description: z.string().trim().max(5000).default(""),
    maxMarks: z.coerce.number().positive("Max marks must be positive.").max(10_000),
    criteria: z.array(criterionInput).max(30),
    policy: policyInput,
  })
  .refine((a) => a.criteria.reduce((s, c) => s + c.maxPoints, 0) <= a.maxMarks + 1e-9, {
    message: "Rubric points add up to more than the max marks.",
    path: ["criteria"],
  });

export type AssignmentInput = z.input<typeof assignmentInput>;

export async function createAssignment(actor: Actor, courseId: string, input: AssignmentInput) {
  const data = assignmentInput.parse(input);
  return db.$transaction(async (tx) => {
    await assertStaff(tx, actor, courseId, { write: true });
    const assignment = await tx.assignment.create({
      data: {
        courseId,
        title: data.title,
        description: data.description,
        maxMarks: data.maxMarks,
        criteria: { create: data.criteria.map((c, order) => ({ ...c, order })) },
        policy: { create: data.policy },
      },
    });
    await audit(tx, actor, { action: "assignment.create", entityType: "Assignment", entityId: assignment.id, after: data });
    return assignment;
  });
}

/** Booking-rule changes students with a booking should hear about. */
function describeRuleChanges(
  before: { freezeHours: number; maxReschedules: number; allowStudentCancel: boolean },
  after: { freezeHours: number; maxReschedules: number; allowStudentCancel: boolean },
): string[] {
  const changes: string[] = [];
  if (before.freezeHours !== after.freezeHours) {
    changes.push(`Changes now lock ${after.freezeHours}h before your slot (was ${before.freezeHours}h).`);
  }
  if (before.maxReschedules !== after.maxReschedules) {
    changes.push(`Changes allowed: ${after.maxReschedules} (was ${before.maxReschedules}).`);
  }
  if (before.allowStudentCancel !== after.allowStudentCancel) {
    changes.push(after.allowStudentCancel ? "You can now cancel your booking yourself." : "You can no longer cancel your booking yourself — ask your TA.");
  }
  return changes;
}

/**
 * Edit an assignment. Guards against edits that would break existing records:
 * max marks below awarded totals, or a demo window that no longer covers booked
 * slots. Slot length, break and capacity apply only to slots added later.
 */
export async function updateAssignment(actor: Actor, assignmentId: string, input: AssignmentInput) {
  const data = assignmentInput.parse(input);
  return db.$transaction(async (tx) => {
    const { assignment } = await assertAssignmentRole(tx, actor, assignmentId, STAFF, { write: true });
    const tz = assignment.course.timezone;

    const top = await tx.evaluation.aggregate({ where: { assignmentId }, _max: { totalMarks: true } });
    if (top._max.totalMarks !== null && data.maxMarks < top._max.totalMarks) {
      throw new DomainError(`A student already has ${top._max.totalMarks} marks, so max marks can't go below that.`, "CONFLICT");
    }
    const outside = { OR: [{ startsAt: { lt: data.policy.windowStart } }, { endsAt: { gt: data.policy.windowEnd } }] };
    const strandedBookings = await tx.booking.count({ where: { assignmentId, status: "BOOKED", slot: outside } });
    if (strandedBookings > 0) {
      throw new DomainError(
        `${strandedBookings} booked demo${strandedBookings === 1 ? " falls" : "s fall"} outside the new demo window. Cancel or move ${strandedBookings === 1 ? "it" : "them"} first.`,
        "CONFLICT",
      );
    }
    const strandedSlots = await tx.slot.count({ where: { assignmentId, status: { not: "CANCELLED" }, ...outside } });

    const current = await tx.rubricCriterion.findMany({ where: { assignmentId }, orderBy: { order: "asc" } });
    const rubricChanged =
      current.length !== data.criteria.length ||
      current.some((c, i) => c.label !== data.criteria[i].label || c.maxPoints !== data.criteria[i].maxPoints);
    if (rubricChanged) {
      const scored = await tx.evaluationScore.count({ where: { criterion: { assignmentId } } });
      if (scored > 0) throw new DomainError("The rubric can't change after marking has started.", "CONFLICT");
      await tx.rubricCriterion.deleteMany({ where: { assignmentId } });
      await tx.rubricCriterion.createMany({ data: data.criteria.map((c, order) => ({ ...c, order, assignmentId })) });
    }
    await tx.assignment.update({
      where: { id: assignmentId },
      data: { title: data.title, description: data.description, maxMarks: data.maxMarks },
    });
    // A new future opening time means students should be told again when it arrives.
    const opensLater = data.policy.bookingOpensAt && data.policy.bookingOpensAt > new Date();
    const reannounce = opensLater && assignment.policy?.bookingOpensAt?.getTime() !== data.policy.bookingOpensAt!.getTime();
    await tx.demoPolicy.upsert({
      where: { assignmentId },
      create: { assignmentId, ...data.policy },
      update: { ...data.policy, ...(reannounce ? { openAnnouncedAt: null } : {}) },
    });

    let notified = 0;
    const changes = assignment.policy ? describeRuleChanges(assignment.policy, data.policy) : [];
    if (changes.length && assignment.status !== "DRAFT") {
      const booked = await tx.booking.findMany({ where: { assignmentId, status: "BOOKED" }, select: { studentId: true } });
      await notify(
        tx,
        booked.map((b) => b.studentId),
        {
          type: "assignment.rules_changed",
          title: `Demo rules changed: ${data.title}`,
          body: `The booking rules for ${assignment.course.code} — ${data.title} have changed:\n${changes.map((c) => `• ${c}`).join("\n")}`,
          link: `/courses/${assignment.courseId}/assignments/${assignmentId}`,
        },
      );
      notified = booked.length;
    }
    if (reannounce && assignment.status === "PUBLISHED") {
      await announceBookingOpens(tx, { ...assignment, title: data.title }, data.policy.bookingOpensAt!, tz);
    }
    await audit(tx, actor, {
      action: "assignment.update",
      entityType: "Assignment",
      entityId: assignmentId,
      before: { title: assignment.title, maxMarks: assignment.maxMarks, policy: assignment.policy },
      after: data,
    });
    return { notified, strandedSlots };
  });
}

type AnnounceTarget = { id: string; title: string; courseId: string; course: { code: string } };

async function studentIds(tx: Tx, courseId: string) {
  const students = await tx.enrollment.findMany({ where: { courseId, role: "STUDENT" }, select: { userId: true } });
  return students.map((s) => s.userId);
}

/** "Booking opens on …" — sent at publish time when booking opens later. */
async function announceBookingOpens(tx: Tx, a: AnnounceTarget, opensAt: Date, tz: string) {
  await notify(tx, await studentIds(tx, a.courseId), {
    type: "assignment.opens_soon",
    title: `Demo booking opens ${fmt(opensAt, tz, "EEE d MMM, HH:mm")}: ${a.title}`,
    body: `Demo slots for ${a.course.code} — ${a.title} are published. Booking opens ${fmt(opensAt, tz, "EEEE d MMMM 'at' HH:mm")} (${tz}). We'll remind you when it opens.`,
    link: `/courses/${a.courseId}/assignments/${a.id}`,
  });
}

/** "Book your demo" — sent when booking is actually open (publish, or by the worker at bookingOpensAt). */
export async function announceBookingOpen(tx: Tx, a: AnnounceTarget, opts: { reopened?: boolean } = {}) {
  // Students who already booked (e.g. with a late-booking allowance) don't need the nudge.
  const booked = await tx.booking.findMany({ where: { assignmentId: a.id, status: { not: "CANCELLED" } }, select: { studentId: true } });
  const skip = new Set(booked.map((b) => b.studentId));
  await notify(
    tx,
    (await studentIds(tx, a.courseId)).filter((id) => !skip.has(id)),
    {
      type: "assignment.published",
      title: `${opts.reopened ? "Booking reopened" : "Book your demo"}: ${a.title}`,
      body: `Demo slots for ${a.course.code} — ${a.title} are ${opts.reopened ? "open again" : "now open"}. Pick a time that suits you.`,
      link: `/courses/${a.courseId}/assignments/${a.id}`,
    },
  );
  await tx.demoPolicy.update({ where: { assignmentId: a.id }, data: { openAnnouncedAt: new Date() } });
}

/**
 * Opens booking: the assignment and all its draft slots go live. Students are told
 * now, or — when booking opens later — told the opening time and reminded by the
 * worker when it arrives.
 */
export async function publishAssignment(actor: Actor, assignmentId: string, now = new Date()) {
  return db.$transaction(async (tx) => {
    const { assignment } = await assertAssignmentRole(tx, actor, assignmentId, STAFF, { write: true });
    if (assignment.status === "PUBLISHED") throw new DomainError("Already published.");
    const slotCount = await tx.slot.count({ where: { assignmentId, status: { not: "CANCELLED" } } });
    if (slotCount === 0) throw new DomainError("Add availability to create slots before publishing.");
    await tx.slot.updateMany({ where: { assignmentId, status: "DRAFT" }, data: { status: "PUBLISHED" } });
    await tx.assignment.update({ where: { id: assignmentId }, data: { status: "PUBLISHED" } });

    const opensAt = assignment.policy?.bookingOpensAt;
    const opensLater = Boolean(opensAt && opensAt > now);
    if (opensLater) {
      await tx.demoPolicy.update({ where: { assignmentId }, data: { openAnnouncedAt: null } });
      await announceBookingOpens(tx, assignment, opensAt!, assignment.course.timezone);
    } else {
      await announceBookingOpen(tx, assignment, { reopened: assignment.status === "CLOSED" });
    }
    await audit(tx, actor, { action: "assignment.publish", entityType: "Assignment", entityId: assignmentId });
    return { opensAt: opensLater ? opensAt! : null, timezone: assignment.course.timezone };
  });
}

/** Stops new bookings and changes. Existing bookings stay so demos and marking can continue. */
export async function closeAssignment(actor: Actor, assignmentId: string) {
  return db.$transaction(async (tx) => {
    await assertAssignmentRole(tx, actor, assignmentId, STAFF, { write: true });
    await tx.assignment.update({ where: { id: assignmentId }, data: { status: "CLOSED" } });
    await audit(tx, actor, { action: "assignment.close", entityType: "Assignment", entityId: assignmentId });
  });
}

export async function deleteAssignment(actor: Actor, assignmentId: string) {
  return db.$transaction(async (tx) => {
    const { assignment } = await assertAssignmentRole(tx, actor, assignmentId, STAFF, { write: true });
    const bookings = await tx.booking.count({ where: { assignmentId } });
    if (bookings > 0) throw new DomainError("Students have booked this assignment — close it instead.", "CONFLICT");
    await tx.assignment.delete({ where: { id: assignmentId } });
    await audit(tx, actor, { action: "assignment.delete", entityType: "Assignment", entityId: assignmentId, before: { title: assignment.title } });
  });
}

export async function listAssignments(actor: Actor, courseId: string) {
  const role = await assertCourseRole(db, actor, courseId, ["INSTRUCTOR", "TA", "STUDENT"]);
  return db.assignment.findMany({
    where: { courseId, ...(role === "STUDENT" ? { status: { not: "DRAFT" } } : {}) },
    include: { policy: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getAssignment(actor: Actor, assignmentId: string) {
  const { assignment, role } = await assertAssignmentRole(db, actor, assignmentId, ["INSTRUCTOR", "TA", "STUDENT"]);
  if (role === "STUDENT" && assignment.status === "DRAFT") throw new DomainError("Assignment not found.", "NOT_FOUND");
  const criteria = await db.rubricCriterion.findMany({ where: { assignmentId }, orderBy: { order: "asc" } });
  return { assignment, criteria, role };
}
