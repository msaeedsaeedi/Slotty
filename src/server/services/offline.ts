import { db } from "@/server/db";
import type { Actor } from "@/server/services/access";
import { ACTIVE_BOOKING } from "@/server/services/slots";
import { OFFLINE_EXPIRY_DAYS, OFFLINE_WINDOW_DAYS, offlinePages, shortHash, type OfflinePage, type OfflineRole } from "@/domain/offline-pages";

const DAY = 86_400_000;

type Stamp = Date | null | undefined;
const ms = (d: Stamp) => (d ? d.getTime() : 0);

/**
 * The pages this account keeps on its device for offline use, with a version each (#162).
 * The rule is `offlinePages` (src/domain); this gathers what it needs with a fixed number of
 * grouped queries, so the cost doesn't grow with the number of pages.
 *
 * Access: an account only ever gets pages of its own enrollments (the same rule the pages
 * use); admin and platform accounts get none. Versions are hashes of when things last
 * changed in each course, so they reveal nothing but "something changed".
 */
export async function offlinePagesFor(actor: Actor, now = new Date()): Promise<{ pages: OfflinePage[]; expiresAt: string }> {
  const expiresAt = new Date(now.getTime() + OFFLINE_EXPIRY_DAYS * DAY).toISOString();
  if (actor.isAdmin || actor.isPlatform) return { pages: [], expiresAt };

  const enrollments = await db.enrollment.findMany({
    where: { userId: actor.id, course: { archived: false } },
    select: { role: true, course: { select: { id: true, timezone: true, updatedAt: true } } },
  });
  const courseIds = enrollments.map((e) => e.course.id);
  const assignments = await db.assignment.findMany({
    where: { courseId: { in: courseIds } },
    select: { id: true, courseId: true, status: true, updatedAt: true },
  });
  const assignmentIds = assignments.map((a) => a.id);
  const ids = { assignmentId: { in: assignmentIds } };
  const from = new Date(now.getTime() - OFFLINE_WINDOW_DAYS * DAY);
  const to = new Date(now.getTime() + OFFLINE_WINDOW_DAYS * DAY);

  const [slots, ownBookings, hostedBookings, slotStamps, bookingStamps, evaluationStamps, waitlistStamps, requestStamps, criterionStamps, allowanceStamps, policies, venueStamps, rosterStamps, inbox] =
    await Promise.all([
      db.slot.findMany({ where: { ...ids, status: "PUBLISHED", startsAt: { gte: now, lte: to } }, select: { assignmentId: true, startsAt: true } }),
      db.booking.findMany({
        where: { ...ids, studentId: actor.id, status: { in: ["BOOKED", "COMPLETED"] } },
        select: { assignmentId: true, slot: { select: { startsAt: true } } },
      }),
      db.booking.findMany({
        where: { ...ids, status: { in: [...ACTIVE_BOOKING] }, slot: { taId: actor.id, startsAt: { gte: from, lte: to } } },
        select: { assignmentId: true, studentId: true, slot: { select: { startsAt: true } } },
      }),
      db.slot.groupBy({ by: ["assignmentId"], where: ids, _max: { updatedAt: true }, _count: { _all: true } }),
      db.booking.groupBy({ by: ["assignmentId"], where: ids, _max: { updatedAt: true }, _count: { _all: true } }),
      db.evaluation.groupBy({ by: ["assignmentId"], where: ids, _max: { updatedAt: true }, _count: { _all: true } }),
      db.waitlistEntry.groupBy({ by: ["assignmentId"], where: ids, _max: { createdAt: true, notifiedAt: true }, _count: { _all: true } }),
      db.studentRequest.groupBy({ by: ["assignmentId"], where: ids, _max: { createdAt: true, resolvedAt: true }, _count: { _all: true } }),
      db.rubricCriterion.groupBy({ by: ["assignmentId"], where: ids, _max: { updatedAt: true }, _count: { _all: true } }),
      db.bookingAllowance.groupBy({ by: ["assignmentId"], where: ids, _max: { updatedAt: true }, _count: { _all: true } }),
      db.demoPolicy.findMany({ where: ids, select: { assignmentId: true, updatedAt: true } }),
      db.venue.groupBy({ by: ["courseId"], where: { courseId: { in: courseIds } }, _max: { updatedAt: true }, _count: { _all: true } }),
      db.enrollment.groupBy({ by: ["courseId"], where: { courseId: { in: courseIds } }, _max: { createdAt: true }, _count: { _all: true } }),
      db.notification.aggregate({ where: { userId: actor.id }, _max: { createdAt: true, readAt: true }, _count: { _all: true } }),
    ]);

  // Everything that changes in an assignment, as one string per assignment.
  const perAssignment = new Map<string, string[]>();
  const note = (assignmentId: string, ...parts: (number | string)[]) => {
    const list = perAssignment.get(assignmentId) ?? [];
    list.push(parts.join(","));
    perAssignment.set(assignmentId, list);
  };
  for (const s of slotStamps) note(s.assignmentId, "s", ms(s._max.updatedAt), s._count._all);
  for (const s of bookingStamps) note(s.assignmentId, "b", ms(s._max.updatedAt), s._count._all);
  for (const s of evaluationStamps) note(s.assignmentId, "e", ms(s._max.updatedAt), s._count._all);
  for (const s of waitlistStamps) note(s.assignmentId, "w", ms(s._max.createdAt), ms(s._max.notifiedAt), s._count._all);
  for (const s of requestStamps) note(s.assignmentId, "r", ms(s._max.createdAt), ms(s._max.resolvedAt), s._count._all);
  for (const s of criterionStamps) note(s.assignmentId, "c", ms(s._max.updatedAt), s._count._all);
  for (const s of allowanceStamps) note(s.assignmentId, "a", ms(s._max.updatedAt), s._count._all);
  for (const p of policies) note(p.assignmentId, "p", ms(p.updatedAt));
  const venues = new Map(venueStamps.map((v) => [v.courseId, `${ms(v._max.updatedAt)},${v._count._all}`]));
  const roster = new Map(rosterStamps.map((r) => [r.courseId, `${ms(r._max.createdAt)},${r._count._all}`]));

  const courses = enrollments.map((e) => {
    const mine = assignments.filter((a) => a.courseId === e.course.id);
    const parts = [
      ms(e.course.updatedAt),
      venues.get(e.course.id) ?? "-",
      roster.get(e.course.id) ?? "-",
      ...mine.map((a) => `${a.id}:${a.status}:${ms(a.updatedAt)}:${(perAssignment.get(a.id) ?? []).join(";")}`),
    ];
    return {
      id: e.course.id,
      role: e.role as OfflineRole,
      timezone: e.course.timezone,
      fingerprint: shortHash(parts.join("|")),
      assignments: mine.map((a) => ({ id: a.id, status: a.status, slotStarts: slots.filter((s) => s.assignmentId === a.id).map((s) => s.startsAt) })),
    };
  });
  const courseOf = new Map(assignments.map((a) => [a.id, a.courseId]));

  const pages = offlinePages({
    now,
    outsideCourses: false,
    userFingerprint: shortHash([ms(inbox._max.createdAt), ms(inbox._max.readAt), inbox._count._all].join(",")),
    courses,
    ownBookings: ownBookings.map((b) => ({ courseId: courseOf.get(b.assignmentId)!, assignmentId: b.assignmentId, startsAt: b.slot.startsAt })),
    hostedBookings: hostedBookings.map((b) => ({ courseId: courseOf.get(b.assignmentId)!, assignmentId: b.assignmentId, studentId: b.studentId, startsAt: b.slot.startsAt })),
  });
  return { pages, expiresAt };
}
