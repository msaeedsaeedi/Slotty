import { z } from "zod";
import { DomainError } from "@/domain/result";
import { db } from "@/server/db";
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
    await assertStaff(tx, actor, courseId);
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

export async function updateAssignment(actor: Actor, assignmentId: string, input: AssignmentInput) {
  const data = assignmentInput.parse(input);
  return db.$transaction(async (tx) => {
    const { assignment } = await assertAssignmentRole(tx, actor, assignmentId, STAFF);
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
    await tx.demoPolicy.upsert({
      where: { assignmentId },
      create: { assignmentId, ...data.policy },
      update: data.policy,
    });
    await audit(tx, actor, {
      action: "assignment.update",
      entityType: "Assignment",
      entityId: assignmentId,
      before: { title: assignment.title, maxMarks: assignment.maxMarks, policy: assignment.policy },
      after: data,
    });
  });
}

/** Opens booking: the assignment and all its draft slots go live and students are told. */
export async function publishAssignment(actor: Actor, assignmentId: string) {
  return db.$transaction(async (tx) => {
    const { assignment } = await assertAssignmentRole(tx, actor, assignmentId, STAFF);
    if (assignment.status === "PUBLISHED") throw new DomainError("Already published.");
    const slotCount = await tx.slot.count({ where: { assignmentId, status: { not: "CANCELLED" } } });
    if (slotCount === 0) throw new DomainError("Add availability to create slots before publishing.");
    await tx.slot.updateMany({ where: { assignmentId, status: "DRAFT" }, data: { status: "PUBLISHED" } });
    await tx.assignment.update({ where: { id: assignmentId }, data: { status: "PUBLISHED" } });
    const students = await tx.enrollment.findMany({
      where: { courseId: assignment.courseId, role: "STUDENT" },
      select: { userId: true },
    });
    const wasClosed = assignment.status === "CLOSED";
    await notify(
      tx,
      students.map((s) => s.userId),
      {
        type: "assignment.published",
        title: `${wasClosed ? "Booking reopened" : "Book your demo"}: ${assignment.title}`,
        body: `Demo slots for ${assignment.course.code} — ${assignment.title} are ${wasClosed ? "open again" : "now open"}. Pick a time that suits you.`,
        link: `/courses/${assignment.courseId}/assignments/${assignmentId}`,
      },
    );
    await audit(tx, actor, { action: "assignment.publish", entityType: "Assignment", entityId: assignmentId });
  });
}

/** Stops new bookings and changes. Existing bookings stay so demos and marking can continue. */
export async function closeAssignment(actor: Actor, assignmentId: string) {
  return db.$transaction(async (tx) => {
    await assertAssignmentRole(tx, actor, assignmentId, STAFF);
    await tx.assignment.update({ where: { id: assignmentId }, data: { status: "CLOSED" } });
    await audit(tx, actor, { action: "assignment.close", entityType: "Assignment", entityId: assignmentId });
  });
}

export async function deleteAssignment(actor: Actor, assignmentId: string) {
  return db.$transaction(async (tx) => {
    const { assignment } = await assertAssignmentRole(tx, actor, assignmentId, STAFF);
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
