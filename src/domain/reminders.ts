import { atLocalHour } from "@/lib/time";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** The morning-of reminder goes out at this hour, in the course timezone, on the demo day. */
export const MORNING_REMINDER_HOUR = 8;
/** The last reminder, by push only, this long before the demo starts. */
export const LAST_REMINDER_MINUTES = 10;

/**
 * Is the morning-of reminder due? From 08:00 (course timezone) on the demo day, for a demo later
 * that day. Skipped when the demo starts within the hour (the 1-hour reminder covers it) and when
 * the student booked after 08:00 that day (the booking confirmation covers it). If the worker was
 * down at 08:00, it still goes out late while the demo is more than an hour away.
 */
export function morningReminderDue(args: { startsAt: Date; bookedAt: Date; timezone: string; now: Date }): boolean {
  const { startsAt, bookedAt, timezone, now } = args;
  const morning = atLocalHour(startsAt, timezone, MORNING_REMINDER_HOUR);
  if (now < morning) return false;
  if (startsAt.getTime() - now.getTime() < HOUR) return false;
  return bookedAt < morning;
}

/**
 * Is the 10-minute reminder due? From 10 minutes before the start until it starts, and only for
 * bookings made more than 10 minutes ahead (a last-minute booking already has the details open).
 */
export function lastReminderDue(args: { startsAt: Date; bookedAt: Date; now: Date }): boolean {
  const { startsAt, bookedAt, now } = args;
  const from = startsAt.getTime() - LAST_REMINDER_MINUTES * MINUTE;
  if (now.getTime() < from || now >= startsAt) return false;
  return bookedAt.getTime() < from;
}
