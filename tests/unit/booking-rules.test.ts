import { describe, expect, it } from "vitest";
import { canBookSlot, canCancelBooking, canReschedule, isFrozen, type PolicyRules, type SlotState } from "@/domain/booking-rules";

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

describe("canCancelBooking", () => {
  const booking = { status: "BOOKED" as const, rescheduleCount: 0, slotStartsAt: hoursFromNow(48) };
  it("allows cancelling outside the freeze window", () => {
    expect(canCancelBooking({ now, policy, booking }).ok).toBe(true);
  });
  it("rejects inside the freeze window", () => {
    const res = canCancelBooking({ now, policy, booking: { ...booking, slotStartsAt: hoursFromNow(5) } });
    expect(res).toMatchObject({ ok: false, reason: "Changes are locked 12h before the slot starts." });
  });
  it("respects allowStudentCancel", () => {
    expect(canCancelBooking({ now, policy: { ...policy, allowStudentCancel: false }, booking }).ok).toBe(false);
  });
  it("rejects completed bookings", () => {
    expect(canCancelBooking({ now, policy, booking: { ...booking, status: "COMPLETED" } }).ok).toBe(false);
  });
});

describe("canReschedule", () => {
  const booking = { status: "BOOKED" as const, rescheduleCount: 0, slotStartsAt: hoursFromNow(48) };
  const args = { now, assignmentStatus: "PUBLISHED" as const, policy, booking, target: { ...openSlot, startsAt: hoursFromNow(72) } };

  it("allows a reschedule within limits", () => {
    expect(canReschedule(args).ok).toBe(true);
  });
  it("enforces the reschedule limit", () => {
    expect(canReschedule({ ...args, booking: { ...booking, rescheduleCount: 2 } })).toMatchObject({
      ok: false,
      reason: "You have used all 2 reschedules.",
    });
  });
  it("rejects when the current slot is frozen", () => {
    expect(canReschedule({ ...args, booking: { ...booking, slotStartsAt: hoursFromNow(3) } }).ok).toBe(false);
  });
  it("rejects a full target slot", () => {
    expect(canReschedule({ ...args, target: { ...args.target, activeBookings: 1 } }).ok).toBe(false);
  });
});
