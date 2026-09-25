import { Prisma } from "@/generated/prisma/client";
import { canBookSlot, canCancelBooking, canReschedule } from "@/domain/booking-rules";
import { assertRule, DomainError } from "@/domain/result";
import { overlaps } from "@/domain/slots";
import { fmtRange } from "@/lib/time";
import { db, type Tx } from "@/server/db";
import { assertCourseRole, STAFF, type Actor } from "./access";
import { audit } from "./audit";
import { notify } from "./notify";
import { ACTIVE_BOOKING } from "./slots";

/** Lock slot rows (in a stable order, to avoid deadlocks) and load them with live booking counts. */
async function lockSlots(tx: Tx, slotIds: string[]) {
  const ids = [...new Set(slotIds)].sort();
  for (const id of ids) await tx.$queryRaw`SELECT id FROM "Slot" WHERE id = ${id} FOR UPDATE`;
  const slots = await tx.slot.findMany({
    where: { id: { in: ids } },
    include: {
      venue: true,
      ta: { select: { name: true } },
      assignment: { include: { course: true, policy: true } },
      _count: { select: { bookings: { where: { status: { in: [...ACTIVE_BOOKING] } } } } },
    },
  });
  const byId = new Map(slots.map((s) => [s.id, s]));
  return (id: string) => {
    const slot = byId.get(id);
    if (!slot) throw new DomainError("Slot not found.", "NOT_FOUND");
    return slot;
  };
}

type LockedSlot = ReturnType<Awaited<ReturnType<typeof lockSlots>>>;

function slotState(slot: LockedSlot) {
  return { startsAt: slot.startsAt, status: slot.status, capacity: slot.capacity, activeBookings: slot._count.bookings };
}

function describeSlot(slot: LockedSlot) {
  const tz = slot.assignment.course.timezone;
  const venue = slot.venue ? [slot.venue.name, slot.venue.location].filter(Boolean).join(", ") : "Venue to be announced";
  const meeting = slot.venue?.meetingUrl ? `\nMeeting link: ${slot.venue.meetingUrl}` : "";
  return `${fmtRange(slot.startsAt, slot.endsAt, tz)} (${tz})\nWhere: ${venue}${meeting}\nWith: ${slot.ta.name}`;
}

const link = (slot: LockedSlot) => `/courses/${slot.assignment.courseId}/assignments/${slot.assignmentId}`;

async function assertNoTimeClash(tx: Tx, studentId: string, slot: LockedSlot, ignoreBookingId?: string) {
  const others = await tx.booking.findMany({
    where: { studentId, status: "BOOKED", id: ignoreBookingId ? { not: ignoreBookingId } : undefined },
    include: { slot: true },
  });
  const clash = others.find((b) => overlaps(b.slot, slot));
  if (clash) throw new DomainError("You already have another demo booked at that time.", "CONFLICT");
}

function translateUniqueViolation(e: unknown): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
    throw new DomainError("You already have a booking for this assignment.", "CONFLICT");
  }
  throw e;
}

export async function bookSlot(actor: Actor, slotId: string, now = new Date()) {
  try {
    return await db.$transaction(async (tx) => {
      const get = await lockSlots(tx, [slotId]);
      const slot = get(slotId);
      const { assignment } = slot;
      await assertCourseRole(tx, actor, assignment.courseId, ["STUDENT"]);
      if (!assignment.policy) throw new DomainError("This assignment is not open for booking.");

      const existing = await tx.booking.findFirst({
        where: { assignmentId: assignment.id, studentId: actor.id, status: { in: [...ACTIVE_BOOKING] } },
      });
      if (existing) throw new DomainError("You already have a booking for this assignment — reschedule it instead.", "CONFLICT");

      assertRule(canBookSlot({ now, assignmentStatus: assignment.status, policy: assignment.policy, slot: slotState(slot) }), "CONFLICT");
      await assertNoTimeClash(tx, actor.id, slot);

      const booking = await tx.booking.create({ data: { slotId, assignmentId: assignment.id, studentId: actor.id } });
      await notify(tx, [actor.id], {
        type: "booking.confirmed",
        title: `Demo booked: ${assignment.title}`,
        body: `You're booked for your ${assignment.course.code} demo.\n\nWhen: ${describeSlot(slot)}`,
        link: link(slot),
      });
      return booking;
    });
  } catch (e) {
    translateUniqueViolation(e);
  }
}

async function loadOwnBooking(tx: Tx, actor: Actor, bookingId: string) {
  const booking = await tx.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.studentId !== actor.id) throw new DomainError("Booking not found.", "NOT_FOUND");
  return booking;
}

export async function cancelBooking(actor: Actor, bookingId: string, now = new Date()) {
  return db.$transaction(async (tx) => {
    const booking = await loadOwnBooking(tx, actor, bookingId);
    const slot = (await lockSlots(tx, [booking.slotId]))(booking.slotId);
    const policy = slot.assignment.policy!;
    assertRule(canCancelBooking({ now, policy, booking: { ...booking, slotStartsAt: slot.startsAt } }));
    await tx.booking.update({
      where: { id: bookingId },
      data: { status: "CANCELLED", cancelledAt: now, cancelledById: actor.id },
    });
    await notify(tx, [actor.id], {
      type: "booking.cancelled",
      title: `Booking cancelled: ${slot.assignment.title}`,
      body: `You cancelled your demo slot:\n${describeSlot(slot)}\n\nRemember to book a new slot before the demo window closes.`,
      link: link(slot),
    });
  });
}

export async function rescheduleBooking(actor: Actor, bookingId: string, newSlotId: string, now = new Date()) {
  try {
    return await db.$transaction(async (tx) => {
      const booking = await loadOwnBooking(tx, actor, bookingId);
      if (booking.slotId === newSlotId) throw new DomainError("You're already booked into that slot.");
      const get = await lockSlots(tx, [booking.slotId, newSlotId]);
      const from = get(booking.slotId);
      const to = get(newSlotId);
      if (to.assignmentId !== booking.assignmentId) throw new DomainError("That slot belongs to a different assignment.");
      const { assignment } = to;

      assertRule(
        canReschedule({
          now,
          assignmentStatus: assignment.status,
          policy: assignment.policy!,
          booking: { ...booking, slotStartsAt: from.startsAt },
          target: slotState(to),
        }),
        "CONFLICT",
      );
      await assertNoTimeClash(tx, actor.id, to, booking.id);

      await tx.booking.update({
        where: { id: booking.id },
        data: { status: "CANCELLED", cancelledAt: now, cancelledById: actor.id },
      });
      const next = await tx.booking.create({
        data: {
          slotId: to.id,
          assignmentId: booking.assignmentId,
          studentId: actor.id,
          rescheduleCount: booking.rescheduleCount + 1,
        },
      });
      await notify(tx, [actor.id], {
        type: "booking.rescheduled",
        title: `Demo rescheduled: ${assignment.title}`,
        body: `Your demo has moved.\n\nNew time: ${describeSlot(to)}\n\nPrevious: ${fmtRange(from.startsAt, from.endsAt, assignment.course.timezone)}`,
        link: link(to),
      });
      return next;
    });
  } catch (e) {
    translateUniqueViolation(e);
  }
}

/** A student's bookings across all courses, newest first (history included). */
export async function listMyBookings(actor: Actor, filter?: { assignmentId?: string }) {
  return db.booking.findMany({
    where: { studentId: actor.id, ...(filter?.assignmentId ? { assignmentId: filter.assignmentId } : {}) },
    include: {
      slot: { include: { venue: true, ta: { select: { name: true } } } },
      assignment: { include: { course: true, policy: true } },
    },
    orderBy: [{ createdAt: "desc" }],
  });
}

// ─── Staff operations ────────────────────────────────────────────────────────

async function loadBookingForStaff(tx: Tx, actor: Actor, bookingId: string) {
  const booking = await tx.booking.findUnique({
    where: { id: bookingId },
    include: { slot: true, assignment: { include: { course: true } } },
  });
  if (!booking) throw new DomainError("Booking not found.", "NOT_FOUND");
  await assertCourseRole(tx, actor, booking.assignment.courseId, STAFF);
  return booking;
}

/** Record attendance. "BOOKED" means pending (resets a mistaken mark). */
export async function markAttendance(actor: Actor, bookingId: string, status: "BOOKED" | "COMPLETED" | "NO_SHOW") {
  return db.$transaction(async (tx) => {
    const booking = await loadBookingForStaff(tx, actor, bookingId);
    if (booking.status === "CANCELLED") throw new DomainError("This booking was cancelled.");
    const evaluation = await tx.evaluation.findUnique({
      where: { assignmentId_studentId: { assignmentId: booking.assignmentId, studentId: booking.studentId } },
    });
    if (evaluation && (evaluation.status === "SUBMITTED" || evaluation.status === "FINALIZED")) {
      throw new DomainError("Attendance is locked once the evaluation has been submitted.");
    }
    await tx.booking.update({ where: { id: bookingId }, data: { status } });
    await audit(tx, actor, { action: "booking.attendance", entityType: "Booking", entityId: bookingId, before: booking.status, after: status });
  });
}

/** Staff can cancel any upcoming booking (no freeze rules), e.g. on request. */
export async function staffCancelBooking(actor: Actor, bookingId: string, reason: string) {
  return db.$transaction(async (tx) => {
    const booking = await loadBookingForStaff(tx, actor, bookingId);
    if (booking.status !== "BOOKED") throw new DomainError("Only upcoming bookings can be cancelled.");
    await tx.booking.update({
      where: { id: bookingId },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelledById: actor.id },
    });
    await notify(tx, [booking.studentId], {
      type: "booking.cancelled_by_staff",
      title: `Booking cancelled: ${booking.assignment.title}`,
      body: `Course staff cancelled your demo on ${fmtRange(booking.slot.startsAt, booking.slot.endsAt, booking.assignment.course.timezone)}.${reason.trim() ? `\nReason: ${reason.trim()}` : ""}\nPlease book a new slot.`,
      link: `/courses/${booking.assignment.courseId}/assignments/${booking.assignmentId}`,
    });
    await audit(tx, actor, { action: "booking.staff_cancel", entityType: "Booking", entityId: bookingId, after: { reason } });
  });
}

/** Bookings on a given day across the course (the TA "Today" view). */
export async function listDayBookings(actor: Actor, courseId: string, dayStart: Date, dayEnd: Date, opts?: { taId?: string }) {
  await assertCourseRole(db, actor, courseId, STAFF);
  return db.booking.findMany({
    where: {
      status: { in: [...ACTIVE_BOOKING] },
      assignment: { courseId },
      slot: { startsAt: { gte: dayStart, lt: dayEnd }, ...(opts?.taId ? { taId: opts.taId } : {}) },
    },
    include: {
      student: { select: { id: true, name: true, email: true } },
      slot: { include: { venue: true, ta: { select: { id: true, name: true } } } },
      assignment: { select: { id: true, title: true, maxMarks: true } },
      evaluation: { select: { id: true, status: true, totalMarks: true } },
    },
    orderBy: { slot: { startsAt: "asc" } },
  });
}
