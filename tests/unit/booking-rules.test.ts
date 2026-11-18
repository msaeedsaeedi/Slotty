import { describe, expect, it } from "vitest";
import {
  canBookSlot,
  canCancelBooking,
  cancelConsequence,
  cancelSpendsChange,
  canMarkAttendance,
  canReschedule,
  changeBudget,
  isFrozen,
  rescheduleConsequence,
  type PolicyRules,
  type SlotState,
} from "@/domain/booking-rules";

const now = new Date("2026-10-05T08:00:00Z");
const hoursFromNow = (h: number) => new Date(now.getTime() + h * 3_600_000);

const policy: PolicyRules = { bookingOpensAt: null, freezeHours: 12, maxReschedules: 2, allowStudentCancel: true };
const openSlot: SlotState = { startsAt: hoursFromNow(48), status: "PUBLISHED", capacity: 1, activeBookings: 0 };

describe("isFrozen", () => {
  it("locks changes inside the freeze window", () => {
    expect(isFrozen(hoursFromNow(11), now, 12)).toBe(true);
    expect(isFrozen(hoursFromNow(13), now, 12)).toBe(false);
    expect(isFrozen(hoursFromNow(-1), now, 0)).toBe(true);
  });
});

describe("canBookSlot", () => {
  const book = (overrides: Partial<Parameters<typeof canBookSlot>[0]>) =>
    canBookSlot({ now, assignmentStatus: "PUBLISHED", policy, slot: openSlot, ...overrides });

  it("allows booking an open slot", () => {
    expect(book({})).toEqual({ ok: true });
  });
  it("rejects full slots", () => {
    expect(book({ slot: { ...openSlot, activeBookings: 1 } })).toMatchObject({ ok: false, reason: "This slot is full." });
  });
  it("rejects before booking opens", () => {
    expect(book({ policy: { ...policy, bookingOpensAt: hoursFromNow(1) } }).ok).toBe(false);
  });
  it("rejects frozen, unpublished or closed", () => {
    expect(book({ slot: { ...openSlot, startsAt: hoursFromNow(2) } }).ok).toBe(false);
    expect(book({ slot: { ...openSlot, status: "CANCELLED" } }).ok).toBe(false);
    expect(book({ assignmentStatus: "CLOSED" }).ok).toBe(false);
  });
});

describe("changeBudget", () => {
  it("adds staff-granted extra changes to the policy limit", () => {
    expect(changeBudget({ maxReschedules: 2, selfCancellations: 1 })).toEqual({ allowed: 2, used: 1, left: 1, lockedOut: false });
    expect(changeBudget({ maxReschedules: 1, allowance: { extraChanges: 2, lateBooking: false }, selfCancellations: 1 })).toEqual({
      allowed: 3,
      used: 1,
      left: 2,
      lockedOut: false,
    });
  });
  it("never goes below zero left", () => {
    expect(changeBudget({ maxReschedules: 1, selfCancellations: 3 }).left).toBe(0);
  });
});

describe("canBookSlot after cancelling (BR-01)", () => {
  const rebook = (used: number, allowed = 2, lastCancelFree = false) =>
    canBookSlot({ now, assignmentStatus: "PUBLISHED", policy, slot: openSlot, budget: changeBudget({ maxReschedules: allowed, selfCancellations: used, lastCancelFree }) });

  it("allows rebooking after a cancellation that spent a change", () => {
    expect(rebook(1).ok).toBe(true);
    expect(rebook(2).ok).toBe(true);
  });
  it("blocks rebooking after cancelling with no changes left", () => {
    expect(rebook(2, 2, true)).toMatchObject({ ok: false, reason: expect.stringMatching(/used all your changes/) });
    expect(rebook(0, 0, true).ok).toBe(false);
  });
  it("unblocks once staff grant an extra change, which stays a real spare", () => {
    // 2 allowed: reschedule, cancel, rebook, cancel with 0 left (free) → 2 of 2 used, locked out.
    const locked = changeBudget({ maxReschedules: 2, selfCancellations: 2, lastCancelFree: true });
    expect(locked).toMatchObject({ used: 2, allowed: 2, left: 0, lockedOut: true });
    const granted = changeBudget({ maxReschedules: 2, allowance: { extraChanges: 1, lateBooking: false }, selfCancellations: 2, lastCancelFree: true });
    expect(granted).toMatchObject({ used: 2, allowed: 3, left: 1, lockedOut: false });
    expect(canBookSlot({ now, assignmentStatus: "PUBLISHED", policy, slot: openSlot, budget: granted }).ok).toBe(true);
  });
  it("only spends a change when one is left", () => {
    expect(cancelSpendsChange(changeBudget({ maxReschedules: 2, selfCancellations: 1 }))).toBe(true);
    expect(cancelSpendsChange(changeBudget({ maxReschedules: 2, selfCancellations: 2 }))).toBe(false);
  });
});

describe("canBookSlot with a late-booking allowance", () => {
  const late = { extraChanges: 0, lateBooking: true };
  it("lets the student book after booking closed or before it opens", () => {
    expect(canBookSlot({ now, assignmentStatus: "CLOSED", policy, slot: openSlot, allowance: late }).ok).toBe(true);
    expect(canBookSlot({ now, assignmentStatus: "PUBLISHED", policy: { ...policy, bookingOpensAt: hoursFromNow(5) }, slot: openSlot, allowance: late }).ok).toBe(true);
  });
  it("still respects drafts, freeze and capacity", () => {
    expect(canBookSlot({ now, assignmentStatus: "DRAFT", policy, slot: openSlot, allowance: late }).ok).toBe(false);
    expect(canBookSlot({ now, assignmentStatus: "CLOSED", policy, slot: { ...openSlot, activeBookings: 1 }, allowance: late }).ok).toBe(false);
  });
});

describe("canCancelBooking", () => {
  const booking = { status: "BOOKED" as const, slotStartsAt: hoursFromNow(48) };
  const cancel = (overrides: Partial<Parameters<typeof canCancelBooking>[0]> = {}) =>
    canCancelBooking({ now, assignmentStatus: "PUBLISHED", policy, booking, ...overrides });

  it("allows cancelling outside the freeze window", () => {
    expect(cancel().ok).toBe(true);
  });
  it("rejects inside the freeze window", () => {
    expect(cancel({ booking: { ...booking, slotStartsAt: hoursFromNow(5) } })).toMatchObject({
      ok: false,
      reason: "Changes are locked 12h before the slot starts.",
    });
  });
  it("respects allowStudentCancel", () => {
    expect(cancel({ policy: { ...policy, allowStudentCancel: false } }).ok).toBe(false);
  });
  it("rejects completed bookings", () => {
    expect(cancel({ booking: { ...booking, status: "COMPLETED" } }).ok).toBe(false);
  });
  it("rejects once booking has closed, so the student isn't left without a slot (BR-02)", () => {
    expect(cancel({ assignmentStatus: "CLOSED" })).toMatchObject({ ok: false, reason: expect.stringMatching(/Booking is closed/) });
  });
});

describe("canReschedule", () => {
  const booking = { status: "BOOKED" as const, slotStartsAt: hoursFromNow(48) };
  const budget = { allowed: 2, used: 0, left: 2, lockedOut: false };
  const args = { now, assignmentStatus: "PUBLISHED" as const, policy, booking, budget, target: { ...openSlot, startsAt: hoursFromNow(72) } };

  it("allows a reschedule within limits", () => {
    expect(canReschedule(args).ok).toBe(true);
  });
  it("enforces the change budget", () => {
    expect(canReschedule({ ...args, budget: { allowed: 2, used: 2, left: 0, lockedOut: false } })).toMatchObject({
      ok: false,
      reason: "You have used all 2 changes.",
    });
    expect(canReschedule({ ...args, budget: { allowed: 0, used: 0, left: 0, lockedOut: false } })).toMatchObject({
      ok: false,
      reason: "Changing your slot is not allowed for this assignment.",
    });
  });
  it("rejects when the current slot is frozen", () => {
    expect(canReschedule({ ...args, booking: { ...booking, slotStartsAt: hoursFromNow(3) } }).ok).toBe(false);
  });
  it("rejects a full target slot", () => {
    expect(canReschedule({ ...args, target: { ...args.target, activeBookings: 1 } }).ok).toBe(false);
  });
});

describe("cancelConsequence", () => {
  it("explains what cancelling costs", () => {
    const b = (used: number) => changeBudget({ maxReschedules: 2, selfCancellations: used });
    expect(cancelConsequence(b(0))).toMatch(/1 of your 2 remaining changes.*1 change left/);
    expect(cancelConsequence(b(1))).toMatch(/^This uses your last change\..*won't be able to change it again/);
    expect(cancelConsequence(b(2))).toMatch(/won't be able to book another slot yourself/);
  });
  it("says when a reschedule uses the last change", () => {
    expect(rescheduleConsequence(changeBudget({ maxReschedules: 2, selfCancellations: 1 }))).toMatch(/^This uses your last change/);
    expect(rescheduleConsequence(changeBudget({ maxReschedules: 3, selfCancellations: 0 }))).toMatch(/1 of your 3 remaining changes\. You'll have 2 left/);
  });
});

describe("canMarkAttendance (BR-06)", () => {
  const base = { now, slotStartsAt: hoursFromNow(1), bookingStatus: "BOOKED" as const, evaluationStatus: null };
  it("waits until the demo has started", () => {
    expect(canMarkAttendance({ ...base, target: "COMPLETED" }).ok).toBe(false);
    expect(canMarkAttendance({ ...base, target: "NO_SHOW", slotStartsAt: hoursFromNow(-1) }).ok).toBe(true);
  });
  it("always allows resetting to pending", () => {
    expect(canMarkAttendance({ ...base, target: "BOOKED", bookingStatus: "COMPLETED" }).ok).toBe(true);
  });
  it("locks once the evaluation is submitted, and refuses cancelled bookings", () => {
    expect(canMarkAttendance({ ...base, slotStartsAt: hoursFromNow(-1), target: "COMPLETED", evaluationStatus: "SUBMITTED" }).ok).toBe(false);
    expect(canMarkAttendance({ ...base, slotStartsAt: hoursFromNow(-1), target: "COMPLETED", bookingStatus: "CANCELLED" }).ok).toBe(false);
  });
});
