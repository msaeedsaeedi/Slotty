import { describe, expect, it } from "vitest";
import { formatCountdown } from "@/domain/demo-day";
import { lastReminderDue, morningReminderDue } from "@/domain/reminders";

const PKT = "Asia/Karachi"; // UTC+5, no daylight saving
// Demo at 14:00 PKT on 1 Dec = 09:00 UTC; 08:00 PKT that day = 03:00 UTC.
const startsAt = new Date("2026-12-01T09:00:00Z");
const eight = new Date("2026-12-01T03:00:00Z");
const dayBefore = new Date("2026-11-30T10:00:00Z");
const at = (iso: string) => new Date(iso);

describe("morningReminderDue", () => {
  it("is due from 08:00 in the course timezone on the demo day", () => {
    expect(morningReminderDue({ startsAt, bookedAt: dayBefore, timezone: PKT, now: at("2026-12-01T02:59:00Z") })).toBe(false);
    expect(morningReminderDue({ startsAt, bookedAt: dayBefore, timezone: PKT, now: eight })).toBe(true);
  });

  it("still goes out late while the demo is more than an hour away", () => {
    expect(morningReminderDue({ startsAt, bookedAt: dayBefore, timezone: PKT, now: at("2026-12-01T07:30:00Z") })).toBe(true);
    expect(morningReminderDue({ startsAt, bookedAt: dayBefore, timezone: PKT, now: at("2026-12-01T08:00:00Z") })).toBe(true);
  });

  it("is skipped when the demo is under an hour away", () => {
    const early = new Date("2026-12-01T03:45:00Z"); // 08:45 PKT
    expect(morningReminderDue({ startsAt: early, bookedAt: dayBefore, timezone: PKT, now: eight })).toBe(false);
    expect(morningReminderDue({ startsAt, bookedAt: dayBefore, timezone: PKT, now: at("2026-12-01T08:01:00Z") })).toBe(false);
  });

  it("is skipped when the student booked after 08:00 that day", () => {
    expect(morningReminderDue({ startsAt, bookedAt: at("2026-12-01T03:30:00Z"), timezone: PKT, now: at("2026-12-01T04:00:00Z") })).toBe(false);
    expect(morningReminderDue({ startsAt, bookedAt: at("2026-12-01T02:30:00Z"), timezone: PKT, now: at("2026-12-01T04:00:00Z") })).toBe(true);
  });

  it("uses the course timezone, not UTC, to find the morning", () => {
    // 02:00 UTC on 1 Dec is still 07:00 PKT: not due yet, though it's past 00:00 UTC.
    expect(morningReminderDue({ startsAt, bookedAt: dayBefore, timezone: PKT, now: at("2026-12-01T02:00:00Z") })).toBe(false);
    // A demo at 01:00 PKT on 2 Dec (20:00 UTC on 1 Dec) belongs to 2 Dec's morning, so nothing goes out on the evening before.
    const lateNight = new Date("2026-12-01T20:00:00Z");
    expect(morningReminderDue({ startsAt: lateNight, bookedAt: dayBefore, timezone: PKT, now: at("2026-12-01T10:00:00Z") })).toBe(false);
  });
});

describe("lastReminderDue", () => {
  it("is due in the 10 minutes before the start", () => {
    expect(lastReminderDue({ startsAt, bookedAt: dayBefore, now: at("2026-12-01T08:49:59Z") })).toBe(false);
    expect(lastReminderDue({ startsAt, bookedAt: dayBefore, now: at("2026-12-01T08:50:00Z") })).toBe(true);
    expect(lastReminderDue({ startsAt, bookedAt: dayBefore, now: at("2026-12-01T08:59:00Z") })).toBe(true);
    expect(lastReminderDue({ startsAt, bookedAt: dayBefore, now: startsAt })).toBe(false);
  });

  it("is skipped for bookings made within the last 10 minutes", () => {
    expect(lastReminderDue({ startsAt, bookedAt: at("2026-12-01T08:52:00Z"), now: at("2026-12-01T08:55:00Z") })).toBe(false);
    expect(lastReminderDue({ startsAt, bookedAt: at("2026-12-01T08:49:00Z"), now: at("2026-12-01T08:55:00Z") })).toBe(true);
  });
});

describe("formatCountdown", () => {
  const MIN = 60_000;
  it.each([
    [30_000, "starting now"],
    [25 * MIN, "in 25 min"],
    [200 * MIN, "in 3 h 20 min"],
    [23 * 60 * MIN, "in 23 h"],
    [26 * 60 * MIN, "tomorrow"],
    [50 * 60 * MIN, "in 2 days"],
    [6 * 24 * 60 * MIN, "in 6 days"],
  ])("%i ms → %s", (ms, text) => {
    expect(formatCountdown(ms)).toBe(text);
  });
});
