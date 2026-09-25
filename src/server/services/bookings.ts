import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import {
  canBookSlot,
  canCancelBooking,
  canMarkAttendance,
  canReschedule,
  changeBudget,
  NO_ALLOWANCE,
  type Allowance,
  type PolicyRules,
} from "@/domain/booking-rules";
import { assertRule, DomainError } from "@/domain/result";
import { overlaps } from "@/domain/slots";
import { fmtRange } from "@/lib/time";
import { db, type Tx } from "@/server/db";
import { assertCourseRole, assertCourseWritable, STAFF, type Actor } from "./access";
import { audit } from "./audit";
import { notify } from "./notify";
import { ACTIVE_BOOKING } from "./slots";
import { notifyWaitlist } from "./waitlist";

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

async function assertNoTimeClash(
  tx: Tx,
  studentId: string,
  slot: LockedSlot,
  ignoreBookingId?: string,
  message = "You already have another demo booked at that time.",
) {
  const others = await tx.booking.findMany({
    where: { studentId, status: "BOOKED", id: ignoreBookingId ? { not: ignoreBookingId } : undefined },
    include: { slot: true },
  });
  const clash = others.find((b) => overlaps(b.slot, slot));
  if (clash) throw new DomainError(message, "CONFLICT");
}

/**
 * The student's change budget and any staff-granted allowance for one assignment.
 * Only cancellations the student made themselves (including the old half of a
 * reschedule) count; staff cancellations and moves don't.
 */
export async function loadChangeState(tx: Tx, assignmentId: string, studentId: string, policy: PolicyRules) {
  const [selfCancellations, row] = await Promise.all([
    tx.booking.count({ where: { assignmentId, studentId, status: "CANCELLED", cancelledById: studentId } }),
    tx.bookingAllowance.findUnique({ where: { assignmentId_studentId: { assignmentId, studentId } } }),
  ]);
  const allowance: Allowance = row ? { extraChanges: row.extraChanges, lateBooking: row.lateBooking } : NO_ALLOWANCE;
  return { allowance, budget: changeBudget({ maxReschedules: policy.maxReschedules, allowance, selfCancellations }) };
}

/** Change budget for the signed-in student (assignment page). */
export async function getMyChangeState(actor: Actor, assignmentId: string) {
  const policy = await db.demoPolicy.findUnique({ where: { assignmentId } });
  if (!policy) return null;
  return loadChangeState(db, assignmentId, actor.id, policy);
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
      assertCourseWritable(assignment.course);
      if (!assignment.policy) throw new DomainError("This assignment is not open for booking.");

      const existing = await tx.booking.findFirst({
        where: { assignmentId: assignment.id, studentId: actor.id, status: { in: [...ACTIVE_BOOKING] } },
      });
      if (existing) throw new DomainError("You already have a booking for this assignment — reschedule it instead.", "CONFLICT");

      const { budget, allowance } = await loadChangeState(tx, assignment.id, actor.id, assignment.policy);
      assertRule(
        canBookSlot({ now, assignmentStatus: assignment.status, policy: assignment.policy, slot: slotState(slot), budget, allowance }),
        "CONFLICT",
      );
      await assertNoTimeClash(tx, actor.id, slot);

      const booking = await tx.booking.create({ data: { slotId, assignmentId: assignment.id, studentId: actor.id } });
      await tx.waitlistEntry.deleteMany({ where: { assignmentId: assignment.id, studentId: actor.id } });
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
    assertCourseWritable(slot.assignment.course);
    const policy = slot.assignment.policy!;
    const { budget, allowance } = await loadChangeState(tx, booking.assignmentId, actor.id, policy);
    assertRule(
      canCancelBooking({ now, assignmentStatus: slot.assignment.status, policy, booking: { ...booking, slotStartsAt: slot.startsAt }, allowance }),
    );
    const leftAfter = budget.left - 1;
    await tx.booking.update({
      where: { id: bookingId },
      data: { status: "CANCELLED", cancelledAt: now, cancelledById: actor.id },
    });
    await notify(tx, [actor.id], {
      type: "booking.cancelled",
      title: `Booking cancelled: ${slot.assignment.title}`,
      body: `You cancelled your demo slot:\n${describeSlot(slot)}\n\n${
        leftAfter >= 0
          ? "Remember to book a new slot before the demo window closes."
          : "You have no changes left, so ask your TA if you need a new slot."
      }`,
      link: link(slot),
    });
    await notifyWaitlist(tx, booking.assignmentId, now);
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
      assertCourseWritable(assignment.course);

      const { budget, allowance } = await loadChangeState(tx, booking.assignmentId, actor.id, assignment.policy!);
      assertRule(
        canReschedule({
          now,
          assignmentStatus: assignment.status,
          policy: assignment.policy!,
          booking: { ...booking, slotStartsAt: from.startsAt },
          budget,
          target: slotState(to),
          allowance,
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
        },
      });
      await notify(tx, [actor.id], {
        type: "booking.rescheduled",
        title: `Demo rescheduled: ${assignment.title}`,
        body: `Your demo has moved.\n\nNew time: ${describeSlot(to)}\n\nPrevious: ${fmtRange(from.startsAt, from.endsAt, assignment.course.timezone)}`,
        link: link(to),
      });
      await notifyWaitlist(tx, booking.assignmentId, now);
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
  assertCourseWritable(booking.assignment.course);
  return booking;
}

/** Record attendance. "BOOKED" means pending (resets a mistaken mark). */
export async function markAttendance(actor: Actor, bookingId: string, status: "BOOKED" | "COMPLETED" | "NO_SHOW", now = new Date()) {
  return db.$transaction(async (tx) => {
    const booking = await loadBookingForStaff(tx, actor, bookingId);
    const evaluation = await tx.evaluation.findUnique({
      where: { assignmentId_studentId: { assignmentId: booking.assignmentId, studentId: booking.studentId } },
    });
    assertRule(
      canMarkAttendance({
        now,
        slotStartsAt: booking.slot.startsAt,
        bookingStatus: booking.status,
        target: status,
        evaluationStatus: evaluation?.status ?? null,
      }),
    );
    await tx.booking.update({ where: { id: bookingId }, data: { status } });
    if (status === "NO_SHOW" && booking.status !== "NO_SHOW") {
      await notify(tx, [booking.studentId], {
        type: "booking.no_show",
        title: `Missed demo: ${booking.assignment.title}`,
        body: `You were marked as not attending your demo on ${fmtRange(booking.slot.startsAt, booking.slot.endsAt, booking.assignment.course.timezone)}.\nIf this is a mistake or you had a good reason, contact your TA from the assignment page.`,
        link: `/courses/${booking.assignment.courseId}/assignments/${booking.assignmentId}`,
      });
    }
    await audit(tx, actor, { action: "booking.attendance", entityType: "Booking", entityId: bookingId, before: booking.status, after: status });
  });
}

/** Staff can cancel any upcoming booking (no freeze rules), e.g. on request. */
export async function staffCancelBooking(actor: Actor, bookingId: string, reason: string) {
  if (!reason.trim()) throw new DomainError("Give a reason — it's sent to the student.");
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
      body: `Course staff cancelled your demo on ${fmtRange(booking.slot.startsAt, booking.slot.endsAt, booking.assignment.course.timezone)}.\nReason: ${reason.trim()}\nPlease book a new slot. This doesn't use any of your changes. If none of the remaining times work, send a request from the assignment page.`,
      link: `/courses/${booking.assignment.courseId}/assignments/${booking.assignmentId}`,
    });
    await audit(tx, actor, { action: "booking.staff_cancel", entityType: "Booking", entityId: bookingId, after: { reason } });
    await notifyWaitlist(tx, booking.assignmentId);
  });
}

/**
 * Staff put a student into a slot, or move them from their current one — the
 * way out when student self-service is blocked (freeze window, no changes left,
 * booking closed, a no-show). Ignores the freeze window and booking dates;
 * capacity can be exceeded only when explicitly allowed. Never uses the
 * student's change budget.
 */
export async function staffPlaceStudent(
  actor: Actor,
  args: { assignmentId: string; studentId: string; slotId: string; overCapacity?: boolean },
  now = new Date(),
) {
  return db.$transaction(async (tx) => {
    const slot = (await lockSlots(tx, [args.slotId]))(args.slotId);
    if (slot.assignmentId !== args.assignmentId) throw new DomainError("That slot belongs to a different assignment.");
    const { assignment } = slot;
    await assertCourseRole(tx, actor, assignment.courseId, STAFF);
    assertCourseWritable(assignment.course);
    const enrollment = await tx.enrollment.findUnique({
      where: { courseId_userId: { courseId: assignment.courseId, userId: args.studentId } },
      include: { user: { select: { name: true } } },
    });
    if (!enrollment || enrollment.role !== "STUDENT") throw new DomainError("Student not found in this course.", "NOT_FOUND");
    if (slot.status === "CANCELLED") throw new DomainError("That slot was cancelled.");
    if (slot.startsAt <= now) throw new DomainError("That slot has already started.");
    if (slot._count.bookings >= slot.capacity && !args.overCapacity) {
      throw new DomainError("That slot is full. Tick “allow over capacity” to add them anyway.", "CONFLICT");
    }

    const current = await tx.booking.findFirst({
      where: { assignmentId: assignment.id, studentId: args.studentId, status: { in: [...ACTIVE_BOOKING] } },
    });
    if (current?.status === "COMPLETED") throw new DomainError(`${enrollment.user.name} has already completed this demo.`);
    if (current?.slotId === slot.id) throw new DomainError(`${enrollment.user.name} is already booked into that slot.`);
    await assertNoTimeClash(tx, args.studentId, slot, current?.id, `${enrollment.user.name} has another demo booked at that time.`);

    if (current) {
      await tx.booking.update({ where: { id: current.id }, data: { status: "CANCELLED", cancelledAt: now, cancelledById: actor.id } });
    }
    const booking = await tx.booking.create({ data: { slotId: slot.id, assignmentId: assignment.id, studentId: args.studentId } });
    await tx.waitlistEntry.deleteMany({ where: { assignmentId: assignment.id, studentId: args.studentId } });
    // Placing the student answers any open request for a new time.
    const where = `Placed in ${fmtRange(slot.startsAt, slot.endsAt, assignment.course.timezone)}.`;
    await tx.studentRequest.updateMany({
      where: { assignmentId: assignment.id, studentId: args.studentId, kind: "BOOKING_CHANGE", status: "OPEN" },
      data: { status: "RESOLVED", response: where, resolvedById: actor.id, resolvedAt: now },
    });
    await notify(tx, [args.studentId], {
      type: "booking.placed_by_staff",
      title: `${current ? "Demo moved" : "Demo booked"} by staff: ${assignment.title}`,
      body: `${actor.name} ${current ? "moved your demo" : "booked a demo for you"}. This doesn't use any of your changes.\n\nWhen: ${describeSlot(slot)}`,
      link: link(slot),
    });
    await audit(tx, actor, {
      action: "booking.staff_place",
      entityType: "Booking",
      entityId: booking.id,
      before: current ? { bookingId: current.id, slotId: current.slotId, status: current.status } : undefined,
      after: { slotId: slot.id, studentId: args.studentId, overCapacity: slot._count.bookings >= slot.capacity },
    });
    if (current?.status === "BOOKED") await notifyWaitlist(tx, assignment.id, now);
    return booking;
  });
}

/**
 * Let a student who was marked as a no-show book again themselves. The no-show
 * booking is closed by staff, so it doesn't use the student's changes.
 */
export async function allowRebookAfterNoShow(actor: Actor, bookingId: string, now = new Date()) {
  return db.$transaction(async (tx) => {
    const booking = await loadBookingForStaff(tx, actor, bookingId);
    if (booking.status !== "NO_SHOW") throw new DomainError("Only no-show bookings can be released for rebooking.");
    const evaluation = await tx.evaluation.findUnique({
      where: { assignmentId_studentId: { assignmentId: booking.assignmentId, studentId: booking.studentId } },
    });
    if (evaluation && (evaluation.status === "SUBMITTED" || evaluation.status === "FINALIZED")) {
      throw new DomainError("This student's evaluation has already been submitted.");
    }
    await tx.booking.update({ where: { id: bookingId }, data: { status: "CANCELLED", cancelledAt: now, cancelledById: actor.id } });
    await notify(tx, [booking.studentId], {
      type: "booking.rebook_allowed",
      title: `You can book again: ${booking.assignment.title}`,
      body: `${actor.name} cleared your missed demo, so you can book a new slot. This doesn't use any of your changes.`,
      link: `/courses/${booking.assignment.courseId}/assignments/${booking.assignmentId}`,
    });
    await audit(tx, actor, { action: "booking.no_show_released", entityType: "Booking", entityId: bookingId, before: "NO_SHOW", after: "CANCELLED" });
  });
}

export const allowanceInput = z.object({
  extraChanges: z.coerce.number().int().min(0, "Extra changes can't be negative.").max(20),
  lateBooking: z.boolean(),
  note: z.string().trim().max(500).optional().transform((v) => v || null),
});

/** Grant (or clear) one student's exception to an assignment's booking rules. */
export async function setAllowance(actor: Actor, assignmentId: string, studentId: string, input: z.input<typeof allowanceInput>) {
  const data = allowanceInput.parse(input);
  return db.$transaction(async (tx) => {
    const assignment = await tx.assignment.findUnique({ where: { id: assignmentId }, include: { course: true } });
    if (!assignment) throw new DomainError("Assignment not found.", "NOT_FOUND");
    await assertCourseRole(tx, actor, assignment.courseId, STAFF);
    assertCourseWritable(assignment.course);
    const enrollment = await tx.enrollment.findUnique({ where: { courseId_userId: { courseId: assignment.courseId, userId: studentId } } });
    if (!enrollment || enrollment.role !== "STUDENT") throw new DomainError("Student not found in this course.", "NOT_FOUND");

    const key = { assignmentId_studentId: { assignmentId, studentId } };
    const before = await tx.bookingAllowance.findUnique({ where: key });
    if (data.extraChanges === 0 && !data.lateBooking) {
      if (before) await tx.bookingAllowance.delete({ where: key });
    } else {
      await tx.bookingAllowance.upsert({
        where: key,
        create: { assignmentId, studentId, grantedById: actor.id, ...data },
        update: { grantedById: actor.id, ...data },
      });
      const granted = [
        data.extraChanges > 0 ? `${data.extraChanges} extra change${data.extraChanges === 1 ? "" : "s"}` : "",
        data.lateBooking ? "booking even when booking is closed" : "",
      ].filter(Boolean);
      await notify(tx, [studentId], {
        type: "booking.allowance",
        title: `Exception granted: ${assignment.title}`,
        body: `${actor.name} gave you ${granted.join(" and ")} for ${assignment.course.code} — ${assignment.title}.${data.note ? `\nNote: ${data.note}` : ""}`,
        link: `/courses/${assignment.courseId}/assignments/${assignmentId}`,
      });
    }
    await audit(tx, actor, { action: "booking.allowance", entityType: "Assignment", entityId: assignmentId, before, after: { studentId, ...data } });
  });
}

export async function getAllowance(actor: Actor, assignmentId: string, studentId: string) {
  const assignment = await db.assignment.findUnique({ where: { id: assignmentId }, select: { courseId: true } });
  if (!assignment) throw new DomainError("Assignment not found.", "NOT_FOUND");
  await assertCourseRole(db, actor, assignment.courseId, STAFF);
  return db.bookingAllowance.findUnique({ where: { assignmentId_studentId: { assignmentId, studentId } } });
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

/** Demos that have ended without attendance being recorded, grouped by course-local day (for the Today nudge). */
export async function listOverdueAttendance(actor: Actor, courseId: string, opts?: { taId?: string }, now = new Date()) {
  await assertCourseRole(db, actor, courseId, STAFF);
  return db.booking.findMany({
    where: {
      status: "BOOKED",
      assignment: { courseId },
      slot: { endsAt: { lt: now }, status: { not: "CANCELLED" }, ...(opts?.taId ? { taId: opts.taId } : {}) },
    },
    select: { id: true, slot: { select: { startsAt: true } } },
    orderBy: { slot: { startsAt: "asc" } },
  });
}

/** What staff need to manage one student's booking: future slots, their change budget and any allowance. */
export async function getStudentBookingControls(actor: Actor, assignmentId: string, studentId: string, now = new Date()) {
  const assignment = await db.assignment.findUnique({ where: { id: assignmentId }, include: { policy: true } });
  if (!assignment?.policy) throw new DomainError("Assignment not found.", "NOT_FOUND");
  await assertCourseRole(db, actor, assignment.courseId, STAFF);
  const [state, allowanceRow, slots] = await Promise.all([
    loadChangeState(db, assignmentId, studentId, assignment.policy),
    db.bookingAllowance.findUnique({ where: { assignmentId_studentId: { assignmentId, studentId } } }),
    db.slot.findMany({
      where: { assignmentId, status: { not: "CANCELLED" }, startsAt: { gt: now } },
      include: { ta: { select: { name: true } }, _count: { select: { bookings: { where: { status: { in: [...ACTIVE_BOOKING] } } } } } },
      orderBy: { startsAt: "asc" },
    }),
  ]);
  return {
    budget: state.budget,
    allowance: allowanceRow,
    slots: slots.map(({ _count, ...s }) => ({ ...s, booked: _count.bookings })),
  };
}
