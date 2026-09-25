import { z } from "zod";
import { DomainError } from "@/domain/result";
import { generateSlots, overlaps } from "@/domain/slots";
import { fmt, fmtRange } from "@/lib/time";
import { db, type Tx } from "@/server/db";
import { assertAssignmentRole, assertCourseRole, STAFF, type Actor } from "./access";
import { audit } from "./audit";
import { notify } from "./notify";

export const ACTIVE_BOOKING = ["BOOKED", "COMPLETED", "NO_SHOW"] as const;

export const availabilityInput = z
  .object({
    taId: z.string().min(1),
    venueId: z.string().nullable(),
    startsAt: z.date(),
    endsAt: z.date(),
  })
  .refine((b) => b.endsAt > b.startsAt, { message: "End time must be after start time.", path: ["endsAt"] });

async function loadForScheduling(tx: Tx, actor: Actor, assignmentId: string) {
  const { assignment } = await assertAssignmentRole(tx, actor, assignmentId, STAFF, { write: true });
  if (!assignment.policy) throw new DomainError("Set the demo policy first.");
  if (assignment.status === "CLOSED") throw new DomainError("This assignment is closed.");
  return { assignment, policy: assignment.policy };
}

/** Preview the slots a block would produce, without saving. */
export async function previewAvailability(actor: Actor, assignmentId: string, input: z.input<typeof availabilityInput>) {
  const block = availabilityInput.parse(input);
  const { policy } = await loadForScheduling(db, actor, assignmentId);
  return generateSlots({ ...policy, blockStart: block.startsAt, blockEnd: block.endsAt });
}

/**
 * Save a TA's availability block and generate its slots. Slots are drafts until
 * published, unless the assignment is already live. Rejects blocks that overlap
 * the same TA's existing slots (in any assignment).
 */
export async function addAvailability(actor: Actor, assignmentId: string, input: z.input<typeof availabilityInput>) {
  const block = availabilityInput.parse(input);
  return db.$transaction(async (tx) => {
    const { assignment, policy } = await loadForScheduling(tx, actor, assignmentId);
    const tz = assignment.course.timezone;

    const ta = await tx.enrollment.findUnique({
      where: { courseId_userId: { courseId: assignment.courseId, userId: block.taId } },
    });
    if (!ta || ta.role === "STUDENT") throw new DomainError("Slots must be hosted by a TA or instructor of this course.");
    if (block.venueId) {
      const venue = await tx.venue.findUnique({ where: { id: block.venueId } });
      if (!venue || venue.courseId !== assignment.courseId) throw new DomainError("Unknown venue.");
    }

    const timings = generateSlots({ ...policy, blockStart: block.startsAt, blockEnd: block.endsAt });
    if (timings.length === 0) {
      throw new DomainError(
        `No ${policy.slotDurationMin}-minute slots fit in that time inside the demo window (${fmt(policy.windowStart, tz)} – ${fmt(policy.windowEnd, tz)}).`,
      );
    }

    const existing = await tx.slot.findMany({
      where: {
        taId: block.taId,
        status: { not: "CANCELLED" },
        startsAt: { lt: timings.at(-1)!.endsAt },
        endsAt: { gt: timings[0].startsAt },
      },
    });
    const clash = existing.find((e) => timings.some((t) => overlaps(e, t)));
    if (clash) {
      throw new DomainError(`This overlaps an existing slot for the same host at ${fmtRange(clash.startsAt, clash.endsAt, tz)}.`, "CONFLICT");
    }

    const created = await tx.availabilityBlock.create({
      data: { assignmentId, taId: block.taId, venueId: block.venueId, startsAt: block.startsAt, endsAt: block.endsAt },
    });
    const status = assignment.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT";
    await tx.slot.createMany({
      data: timings.map((t) => ({
        assignmentId,
        blockId: created.id,
        taId: block.taId,
        venueId: block.venueId,
        startsAt: t.startsAt,
        endsAt: t.endsAt,
        capacity: policy.capacityPerSlot,
        status,
      })),
    });
    await audit(tx, actor, { action: "availability.add", entityType: "Assignment", entityId: assignmentId, after: { ...block, slots: timings.length } });
    return { slots: timings.length, status };
  });
}

/** Remove slots nobody has booked (used to tidy up drafts or unneeded times). */
export async function deleteUnbookedSlots(actor: Actor, slotIds: string[]) {
  return db.$transaction(async (tx) => {
    const slots = await tx.slot.findMany({
      where: { id: { in: slotIds } },
      include: { _count: { select: { bookings: true } } },
    });
    const assignmentIds = [...new Set(slots.map((s) => s.assignmentId))];
    for (const id of assignmentIds) await assertAssignmentRole(tx, actor, id, STAFF, { write: true });
    const deletable = slots.filter((s) => s._count.bookings === 0).map((s) => s.id);
    await tx.slot.deleteMany({ where: { id: { in: deletable } } });
    return { deleted: deletable.length, skipped: slots.length - deletable.length };
  });
}

/** Cancel a slot; any students booked into it are released and told to rebook. */
export async function cancelSlot(actor: Actor, slotId: string, reason: string) {
  return db.$transaction(async (tx) => {
    const slot = await tx.slot.findUnique({ where: { id: slotId }, include: { assignment: { include: { course: true } } } });
    if (!slot) throw new DomainError("Slot not found.", "NOT_FOUND");
    await assertCourseRole(tx, actor, slot.assignment.courseId, STAFF, { write: true });
    if (slot.status === "CANCELLED") return;
    await tx.$queryRaw`SELECT id FROM "Slot" WHERE id = ${slotId} FOR UPDATE`;
    const booked = await tx.booking.findMany({ where: { slotId, status: "BOOKED" } });
    if (booked.length > 0 && !reason.trim()) throw new DomainError("Give a reason — it's sent to the booked students.");
    await tx.booking.updateMany({
      where: { slotId, status: "BOOKED" },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelledById: actor.id },
    });
    await tx.slot.update({ where: { id: slotId }, data: { status: "CANCELLED" } });
    const when = fmtRange(slot.startsAt, slot.endsAt, slot.assignment.course.timezone);
    await notify(
      tx,
      booked.map((b) => b.studentId),
      {
        type: "slot.cancelled",
        title: `Demo slot cancelled: ${slot.assignment.title}`,
        body: `Your demo slot on ${when} was cancelled by course staff.${reason.trim() ? `\nReason: ${reason.trim()}` : ""}\nPlease book a new slot. This doesn't use any of your changes.`,
        link: `/courses/${slot.assignment.courseId}/assignments/${slot.assignmentId}`,
      },
    );
    await audit(tx, actor, { action: "slot.cancel", entityType: "Slot", entityId: slotId, after: { reason, released: booked.length } });
  });
}

/** Move slots to a different venue and tell anyone booked into them. */
export async function changeVenue(actor: Actor, slotIds: string[], venueId: string | null) {
  return db.$transaction(async (tx) => {
    const slots = await tx.slot.findMany({
      where: { id: { in: slotIds }, status: { not: "CANCELLED" } },
      include: { assignment: { include: { course: true } }, venue: true },
      orderBy: { startsAt: "asc" },
    });
    if (slots.length === 0) return { moved: 0 };
    const courseIds = new Set(slots.map((s) => s.assignment.courseId));
    if (courseIds.size !== 1) throw new DomainError("Slots must belong to one course.");
    const courseId = slots[0].assignment.courseId;
    await assertCourseRole(tx, actor, courseId, STAFF, { write: true });
    const venue = venueId ? await tx.venue.findUnique({ where: { id: venueId } }) : null;
    if (venueId && (!venue || venue.courseId !== courseId)) throw new DomainError("Unknown venue.");

    await tx.slot.updateMany({ where: { id: { in: slots.map((s) => s.id) } }, data: { venueId } });

    const bookings = await tx.booking.findMany({
      where: { slotId: { in: slots.map((s) => s.id) }, status: "BOOKED" },
      include: { slot: { include: { assignment: { include: { course: true } } } } },
    });
    const newVenue = venue ? [venue.name, venue.location].filter(Boolean).join(", ") : "TBA";
    for (const b of bookings) {
      const s = b.slot;
      await notify(tx, [b.studentId], {
        type: "slot.venue_changed",
        title: `Venue changed: ${s.assignment.title}`,
        body: `Your demo on ${fmtRange(s.startsAt, s.endsAt, s.assignment.course.timezone)} has moved to: ${newVenue}.${venue?.meetingUrl ? `\nMeeting link: ${venue.meetingUrl}` : ""}`,
        link: `/courses/${courseId}/assignments/${s.assignmentId}`,
      });
    }
    await audit(tx, actor, { action: "slot.venue", entityType: "Slot", entityId: slots.map((s) => s.id).join(","), after: { venueId } });
    return { moved: slots.length, notified: bookings.length };
  });
}

/** All slots for an assignment with their bookings (staff view). */
export async function listSlotsForStaff(actor: Actor, assignmentId: string) {
  await assertAssignmentRole(db, actor, assignmentId, STAFF);
  return db.slot.findMany({
    where: { assignmentId },
    include: {
      venue: true,
      ta: { select: { id: true, name: true } },
      bookings: {
        where: { status: { in: [...ACTIVE_BOOKING] } },
        include: { student: { select: { id: true, name: true, email: true } } },
      },
    },
    orderBy: [{ startsAt: "asc" }, { ta: { name: "asc" } }],
  });
}

/** Published future slots with remaining capacity (student view). */
export async function listOpenSlots(actor: Actor, assignmentId: string) {
  await assertAssignmentRole(db, actor, assignmentId, ["STUDENT", "TA", "INSTRUCTOR"]);
  const slots = await db.slot.findMany({
    where: { assignmentId, status: "PUBLISHED", startsAt: { gt: new Date() } },
    include: {
      venue: true,
      ta: { select: { id: true, name: true } },
      _count: { select: { bookings: { where: { status: { in: [...ACTIVE_BOOKING] } } } } },
    },
    orderBy: { startsAt: "asc" },
  });
  return slots.map(({ _count, ...s }) => ({ ...s, booked: _count.bookings, seatsLeft: Math.max(0, s.capacity - _count.bookings) }));
}
