import { allow, deny, type RuleResult } from "./result";

export interface PolicyRules {
  bookingOpensAt: Date | null;
  freezeHours: number;
  maxReschedules: number;
  allowStudentCancel: boolean;
}

export interface SlotState {
  startsAt: Date;
  status: "DRAFT" | "PUBLISHED" | "CANCELLED";
  capacity: number;
  activeBookings: number;
}

export interface BookingState {
  status: "BOOKED" | "CANCELLED" | "COMPLETED" | "NO_SHOW";
  slotStartsAt: Date;
}

type AssignmentStatus = "DRAFT" | "PUBLISHED" | "CLOSED";

/**
 * How many times a student may move away from a booked slot for one assignment.
 * Reschedules and self-cancellations both spend a change (so cancel → rebook can't
 * dodge the limit); staff cancellations and moves never do.
 */
export interface ChangeBudget {
  allowed: number;
  used: number;
  left: number;
}

/** Per-student exception granted by staff (BookingAllowance). */
export interface Allowance {
  extraChanges: number;
  /** May book or change even after booking has closed. */
  lateBooking: boolean;
}

export const NO_ALLOWANCE: Allowance = { extraChanges: 0, lateBooking: false };

const HOUR = 3_600_000;

export function changeBudget(args: { maxReschedules: number; allowance?: Allowance; selfCancellations: number }): ChangeBudget {
  const allowed = args.maxReschedules + (args.allowance?.extraChanges ?? 0);
  return { allowed, used: args.selfCancellations, left: Math.max(0, allowed - args.selfCancellations) };
}

/** Changes are locked within `freezeHours` of a slot's start. */
export function isFrozen(slotStartsAt: Date, now: Date, freezeHours: number): boolean {
  return slotStartsAt.getTime() - now.getTime() < freezeHours * HOUR;
}

/** The moment changes lock for a slot. */
export function freezeAt(slotStartsAt: Date, freezeHours: number): Date {
  return new Date(slotStartsAt.getTime() - freezeHours * HOUR);
}

function freezeReason(freezeHours: number): string {
  return freezeHours > 0
    ? `Changes are locked ${freezeHours}h before the slot starts.`
    : "This slot has already started.";
}

function isOpen(status: AssignmentStatus, allowance: Allowance): boolean {
  return status === "PUBLISHED" || (status === "CLOSED" && allowance.lateBooking);
}

export function canBookSlot(args: {
  now: Date;
  assignmentStatus: AssignmentStatus;
  policy: PolicyRules;
  slot: SlotState;
  /** Omit for a first booking; required to rebook after cancelling. */
  budget?: ChangeBudget;
  allowance?: Allowance;
}): RuleResult {
  const { now, policy, slot } = args;
  const allowance = args.allowance ?? NO_ALLOWANCE;
  if (!isOpen(args.assignmentStatus, allowance)) return deny("This assignment is not open for booking.");
  if (slot.status !== "PUBLISHED") return deny("This slot is not available.");
  if (policy.bookingOpensAt && now < policy.bookingOpensAt && !allowance.lateBooking) {
    return deny("Booking has not opened yet.");
  }
  if (isFrozen(slot.startsAt, now, policy.freezeHours)) return deny(freezeReason(policy.freezeHours));
  if (slot.activeBookings >= slot.capacity) return deny("This slot is full.");
  // Cancelling spent a change; rebooking is fine until more were spent than allowed.
  if (args.budget && args.budget.used > args.budget.allowed) {
    return deny("You've used all your changes for this assignment, so you can't book again yourself. Ask your TA for a slot.");
  }
  return allow;
}

export function canCancelBooking(args: {
  now: Date;
  assignmentStatus: AssignmentStatus;
  policy: PolicyRules;
  booking: BookingState;
  allowance?: Allowance;
}): RuleResult {
  const { now, policy, booking } = args;
  if (booking.status !== "BOOKED") return deny("Only upcoming bookings can be cancelled.");
  if (!isOpen(args.assignmentStatus, args.allowance ?? NO_ALLOWANCE)) {
    return deny("Booking is closed, so you can't cancel here. Ask your TA if you can't attend.");
  }
  if (!policy.allowStudentCancel) return deny("Cancellations are not allowed for this assignment. Ask your TA if you can't attend.");
  if (isFrozen(booking.slotStartsAt, now, policy.freezeHours)) return deny(freezeReason(policy.freezeHours));
  return allow;
}

export function canReschedule(args: {
  now: Date;
  assignmentStatus: AssignmentStatus;
  policy: PolicyRules;
  booking: BookingState;
  budget: ChangeBudget;
  target: SlotState;
  allowance?: Allowance;
}): RuleResult {
  const { now, policy, booking, budget } = args;
  if (booking.status !== "BOOKED") return deny("Only upcoming bookings can be rescheduled.");
  if (budget.left <= 0) {
    return deny(
      budget.allowed === 0
        ? "Changing your slot is not allowed for this assignment."
        : `You have used all ${budget.allowed} change${budget.allowed === 1 ? "" : "s"}.`,
    );
  }
  if (isFrozen(booking.slotStartsAt, now, policy.freezeHours)) return deny(freezeReason(policy.freezeHours));
  return canBookSlot({ now, assignmentStatus: args.assignmentStatus, policy, slot: args.target, allowance: args.allowance });
}

/** What cancelling will cost, in words, for the confirmation dialog. */
export function cancelConsequence(budget: ChangeBudget): string {
  if (budget.left <= 0) {
    return "You have no changes left, so after cancelling you won't be able to book another slot yourself — only your TA can.";
  }
  const after = budget.left - 1;
  return `This uses 1 of your ${budget.allowed} change${budget.allowed === 1 ? "" : "s"}. You can still book a new slot afterwards${
    after > 0 ? `, with ${after} change${after === 1 ? "" : "s"} left` : ", but you won't be able to change it again"
  }.`;
}

/** What a reschedule will cost, in words, for the confirmation dialog. */
export function rescheduleConsequence(budget: ChangeBudget): string {
  const after = budget.left - 1;
  return `This uses 1 of your ${budget.allowed} change${budget.allowed === 1 ? "" : "s"}${
    after > 0 ? ` (${after} left afterwards)` : " — you won't be able to change it again yourself"
  }.`;
}

/** Attendance can only be recorded once the demo has started; resetting to pending is always allowed. */
export function canMarkAttendance(args: {
  now: Date;
  slotStartsAt: Date;
  bookingStatus: BookingState["status"];
  target: "BOOKED" | "COMPLETED" | "NO_SHOW";
  evaluationStatus: "DRAFT" | "SUBMITTED" | "RETURNED" | "FINALIZED" | null;
}): RuleResult {
  if (args.bookingStatus === "CANCELLED") return deny("This booking was cancelled.");
  if (args.evaluationStatus === "SUBMITTED" || args.evaluationStatus === "FINALIZED") {
    return deny("Attendance is locked once the evaluation has been submitted.");
  }
  if (args.target !== "BOOKED" && args.now < args.slotStartsAt) return deny("You can record attendance once the demo has started.");
  return allow;
}
