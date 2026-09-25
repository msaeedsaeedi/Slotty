import { DomainError } from "@/domain/result";
import { db, type Tx } from "@/server/db";
import { assertAssignmentRole, assertCourseWritable, STAFF, type Actor } from "./access";
import { notify } from "./notify";
import { ACTIVE_BOOKING } from "./slots";

/** Don't ping the same student more often than this while seats keep freeing up. */
const RENOTIFY_MS = 30 * 60_000;

/** Join the "tell me when a slot frees up" list for an assignment. */
export async function joinWaitlist(actor: Actor, assignmentId: string) {
  return db.$transaction(async (tx) => {
    const { assignment } = await assertAssignmentRole(tx, actor, assignmentId, ["STUDENT"]);
    assertCourseWritable(assignment.course);
    if (assignment.status !== "PUBLISHED") throw new DomainError("This assignment is not open for booking.");
    const active = await tx.booking.findFirst({ where: { assignmentId, studentId: actor.id, status: { in: [...ACTIVE_BOOKING] } } });
    if (active) throw new DomainError("You already have a booking for this assignment.");
    await tx.waitlistEntry.upsert({
      where: { assignmentId_studentId: { assignmentId, studentId: actor.id } },
      create: { assignmentId, studentId: actor.id },
      update: {},
    });
  });
}

export async function leaveWaitlist(actor: Actor, assignmentId: string) {
  await db.waitlistEntry.deleteMany({ where: { assignmentId, studentId: actor.id } });
}

export async function isOnWaitlist(actor: Actor, assignmentId: string) {
  return (await db.waitlistEntry.count({ where: { assignmentId, studentId: actor.id } })) > 0;
}

export async function waitlistCount(actor: Actor, assignmentId: string) {
  await assertAssignmentRole(db, actor, assignmentId, STAFF);
  return db.waitlistEntry.count({ where: { assignmentId } });
}

/**
 * A seat may have freed up: tell waiting students (first come, first served).
 * Call inside the transaction that freed the seat, so nothing is sent if it rolls back.
 */
export async function notifyWaitlist(tx: Tx, assignmentId: string, now = new Date()) {
  const assignment = await tx.assignment.findUnique({ where: { id: assignmentId }, include: { course: true } });
  if (!assignment || assignment.status !== "PUBLISHED" || assignment.course.archived) return 0;
  const upcoming = await tx.slot.findMany({
    where: { assignmentId, status: "PUBLISHED", startsAt: { gt: now } },
    select: { capacity: true, _count: { select: { bookings: { where: { status: { in: [...ACTIVE_BOOKING] } } } } } },
  });
  if (!upcoming.some((s) => s._count.bookings < s.capacity)) return 0;
  const entries = await tx.waitlistEntry.findMany({
    where: { assignmentId, OR: [{ notifiedAt: null }, { notifiedAt: { lt: new Date(now.getTime() - RENOTIFY_MS) } }] },
  });
  if (entries.length === 0) return 0;
  await notify(
    tx,
    entries.map((e) => e.studentId),
    {
      type: "waitlist.slot_available",
      title: `A demo slot opened up: ${assignment.title}`,
      body: `A slot is now free for ${assignment.course.code} — ${assignment.title}. Book it soon — the first student to book gets it.`,
      link: `/courses/${assignment.courseId}/assignments/${assignmentId}`,
    },
  );
  await tx.waitlistEntry.updateMany({ where: { id: { in: entries.map((e) => e.id) } }, data: { notifiedAt: now } });
  return entries.length;
}
