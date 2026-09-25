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
  rescheduleCount: number;
  slotStartsAt: Date;
}

const HOUR = 3_600_000;

/** Changes to a booking are locked within `freezeHours` of its start. */
export function isFrozen(slotStartsAt: Date, now: Date, freezeHours: number): boolean {
  return slotStartsAt.getTime() - now.getTime() < freezeHours * HOUR;
}

function freezeReason(freezeHours: number): string {
  return freezeHours > 0
    ? `Changes are locked ${freezeHours}h before the slot starts.`
    : "This slot has already started.";
}

export function canBookSlot(args: {
  now: Date;
  assignmentStatus: "DRAFT" | "PUBLISHED" | "CLOSED";
  policy: PolicyRules;
  slot: SlotState;
}): RuleResult {
  const { now, policy, slot } = args;
  if (args.assignmentStatus !== "PUBLISHED") return deny("This assignment is not open for booking.");
  if (slot.status !== "PUBLISHED") return deny("This slot is not available.");
  if (policy.bookingOpensAt && now < policy.bookingOpensAt) {
    return deny("Booking has not opened yet.");
  }
  if (isFrozen(slot.startsAt, now, policy.freezeHours)) return deny(freezeReason(policy.freezeHours));
  if (slot.activeBookings >= slot.capacity) return deny("This slot is full.");
  return allow;
}

export function canCancelBooking(args: {
  now: Date;
  policy: PolicyRules;
  booking: BookingState;
}): RuleResult {
  const { now, policy, booking } = args;
  if (booking.status !== "BOOKED") return deny("Only upcoming bookings can be cancelled.");
  if (!policy.allowStudentCancel) return deny("Cancellations are not allowed for this assignment. Contact your TA.");
  if (isFrozen(booking.slotStartsAt, now, policy.freezeHours)) return deny(freezeReason(policy.freezeHours));
  return allow;
}

export function canReschedule(args: {
  now: Date;
  assignmentStatus: "DRAFT" | "PUBLISHED" | "CLOSED";
  policy: PolicyRules;
  booking: BookingState;
  target: SlotState;
}): RuleResult {
  const { now, policy, booking } = args;
  if (booking.status !== "BOOKED") return deny("Only upcoming bookings can be rescheduled.");
  if (booking.rescheduleCount >= policy.maxReschedules) {
    return deny(
      policy.maxReschedules === 0
        ? "Rescheduling is not allowed for this assignment."
        : `You have used all ${policy.maxReschedules} reschedules.`,
    );
  }
  if (isFrozen(booking.slotStartsAt, now, policy.freezeHours)) return deny(freezeReason(policy.freezeHours));
  return canBookSlot({ now, assignmentStatus: args.assignmentStatus, policy, slot: args.target });
}
