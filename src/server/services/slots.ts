import { z } from "zod";
import { DomainError } from "@/domain/result";
import { generateSlots, overlaps } from "@/domain/slots";
import { fmt, fmtRange } from "@/lib/time";
import { db, type Tx } from "@/server/db";
import { assertAssignmentRole, assertCourseRole, STAFF, type Actor } from "./access";
import { audit } from "./audit";
import { notify } from "./notify";
import { notifyWaitlist } from "./waitlist";

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
    if (status === "PUBLISHED") await notifyWaitlist(tx, assignmentId);
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

/**
 * Hand slots over to another host (e.g. a TA is ill or leaving the course).
 * Rejects the move if it would double-book the new host; booked students are told.
 */
export async function reassignHost(actor: Actor, slotIds: string[], taId: string) {
  return db.$transaction(async (tx) => {
    const slots = await tx.slot.findMany({
      where: { id: { in: slotIds }, status: { not: "CANCELLED" } },
      include: { assignment: { include: { course: true } } },
      orderBy: { startsAt: "asc" },
    });
    if (slots.length === 0) return { moved: 0, notified: 0 };
    const courseIds = new Set(slots.map((s) => s.assignment.courseId));
    if (courseIds.size !== 1) throw new DomainError("Slots must belong to one course.");
    const { course, courseId } = slots[0].assignment;
    await assertCourseRole(tx, actor, courseId, STAFF, { write: true });
    const host = await tx.enrollment.findUnique({ where: { courseId_userId: { courseId, userId: taId } }, include: { user: true } });
    if (!host || host.role === "STUDENT") throw new DomainError("Slots must be hosted by a TA or instructor of this course.");

    const moving = slots.filter((s) => s.taId !== taId);
    const others = await tx.slot.findMany({
      where: { taId, status: { not: "CANCELLED" }, id: { notIn: moving.map((s) => s.id) } },
    });
    const clash = moving.find((m) => others.some((o) => overlaps(m, o)));
    if (clash) {
      throw new DomainError(`${host.user.name} already hosts a slot overlapping ${fmtRange(clash.startsAt, clash.endsAt, course.timezone)}.`, "CONFLICT");
    }
    await tx.slot.updateMany({ where: { id: { in: moving.map((s) => s.id) } }, data: { taId } });

    const bookings = await tx.booking.findMany({ where: { slotId: { in: moving.map((s) => s.id) }, status: "BOOKED" }, include: { slot: true } });
    for (const b of bookings) {
      const a = moving.find((s) => s.id === b.slotId)!.assignment;
      await notify(tx, [b.studentId], {
        type: "slot.host_changed",
        title: `New examiner: ${a.title}`,
        body: `Your demo on ${fmtRange(b.slot.startsAt, b.slot.endsAt, course.timezone)} will now be with ${host.user.name}. The time and place haven't changed.`,
        link: `/courses/${courseId}/assignments/${a.id}`,
      });
    }
    await audit(tx, actor, { action: "slot.host", entityType: "Slot", entityId: moving.map((s) => s.id).join(","), after: { taId } });
    return { moved: moving.length, notified: bookings.length };
  });
}

/** Change how many students one slot takes. Can't go below the students already booked. */
export async function updateSlotCapacity(actor: Actor, slotId: string, capacity: number) {
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100) throw new DomainError("Capacity must be a whole number from 1 to 100.");
  return db.$transaction(async (tx) => {
    const slot = await tx.slot.findUnique({ where: { id: slotId }, include: { assignment: { include: { course: true } } } });
    if (!slot) throw new DomainError("Slot not found.", "NOT_FOUND");
    await assertCourseRole(tx, actor, slot.assignment.courseId, STAFF, { write: true });
    if (slot.status === "CANCELLED") throw new DomainError("This slot was cancelled.");
    await tx.$queryRaw`SELECT id FROM "Slot" WHERE id = ${slotId} FOR UPDATE`;
    const booked = await tx.booking.count({ where: { slotId, status: { in: [...ACTIVE_BOOKING] } } });
    if (capacity < booked) throw new DomainError(`${booked} students are already booked into this slot, so capacity can't go below ${booked}.`, "CONFLICT");
    await tx.slot.update({ where: { id: slotId }, data: { capacity } });
    await audit(tx, actor, { action: "slot.capacity", entityType: "Slot", entityId: slotId, before: slot.capacity, after: capacity });
    if (capacity > slot.capacity) await notifyWaitlist(tx, slot.assignmentId);
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
