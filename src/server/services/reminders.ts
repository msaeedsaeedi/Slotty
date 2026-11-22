import type { Prisma } from "@/generated/prisma/client";
import { lastReminderDue, LAST_REMINDER_MINUTES, morningReminderDue } from "@/domain/reminders";
import { fmtRange, fmtTime, tzLabel } from "@/lib/time";
import { db, type Tx } from "@/server/db";
import { notify } from "./notify";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const WINDOWS = [
  { field: "reminder24hAt", hours: 24, label: "tomorrow" },
  { field: "reminder1hAt", hours: 1, label: "in about an hour" },
] as const;

const include = {
  slot: { include: { venue: true, ta: { select: { name: true } } } },
  assignment: { include: { course: true } },
  student: { select: { remindMorning: true, remind10m: true } },
} satisfies Prisma.BookingInclude;
type DueBooking = Prisma.BookingGetPayload<{ include: typeof include }>;

const venueOf = (b: DueBooking) => (b.slot.venue ? [b.slot.venue.name, b.slot.venue.location].filter(Boolean).join(", ") : "Venue to be announced");
const meetingLine = (b: DueBooking) => (b.slot.venue?.meetingUrl ? `\nMeeting link: ${b.slot.venue.meetingUrl}` : "");
const pageOf = (b: DueBooking) => `/courses/${b.assignment.courseId}/assignments/${b.assignmentId}`;
const details = (b: DueBooking) => {
  const tz = b.assignment.course.timezone;
  return `When: ${fmtRange(b.slot.startsAt, b.slot.endsAt, tz)} (${tzLabel(tz)})\nWhere: ${venueOf(b)}${meetingLine(b)}\nWith: ${b.slot.ta.name}`;
};

/** Upcoming published bookings whose reminder `field` hasn't been claimed, starting in (from, to]. */
function candidates(field: "reminder24hAt" | "reminder1hAt" | "reminderMorningAt" | "reminder10mAt", from: Date, to: Date) {
  return db.booking.findMany({
    where: { status: "BOOKED", [field]: null, slot: { status: "PUBLISHED", startsAt: { gt: from, lte: to } } },
    include,
    take: 500,
  });
}

/**
 * Claim one reminder for one booking inside `send`'s transaction; if another worker got there
 * first (or the booking changed), skip. A claimed reminder is never sent twice, even when it is
 * skipped (`send` returns false).
 */
async function claim(b: DueBooking, field: "reminder24hAt" | "reminder1hAt" | "reminderMorningAt" | "reminder10mAt", now: Date, send: (tx: Tx) => Promise<boolean>) {
  return db.$transaction(async (tx) => {
    const claimed = await tx.booking.updateMany({ where: { id: b.id, status: "BOOKED", [field]: null }, data: { [field]: now } });
    if (claimed.count === 0) return false;
    return send(tx);
  });
}

/**
 * Queue the reminders that are due for upcoming bookings, each at most once:
 * - 24 hours and 1 hour before (email and in-app; the email follows `emailReminders`), skipped
 *   when the student booked inside that window (the confirmation covered it);
 * - the morning of the demo day (`morningReminderDue`; email, in-app and push; `remindMorning`);
 * - 10 minutes before (`lastReminderDue`; push only, with the meeting link; `remind10m`).
 * Rescheduling or a staff move creates a new booking, so its reminders start afresh; cancelled
 * bookings get none.
 */
export async function queueDueReminders(now = new Date()): Promise<number> {
  let queued = 0;
  for (const w of WINDOWS) {
    for (const b of await candidates(w.field, now, new Date(now.getTime() + w.hours * HOUR))) {
      const sent = await claim(b, w.field, now, async (tx) => {
        const bookedLate = b.createdAt.getTime() > b.slot.startsAt.getTime() - w.hours * HOUR;
        if (bookedLate) return false;
        await notify(tx, [b.studentId], {
          type: "booking.reminder",
          title: `Reminder: ${b.assignment.title} demo ${w.label}`,
          body: `Your ${b.assignment.course.code} demo is ${w.label}.\n\n${details(b)}`,
          link: pageOf(b),
          category: "reminder",
        });
        return true;
      });
      if (sent) queued++;
    }
  }

  // Morning of the demo day: demos at least an hour away and no more than a day ahead.
  for (const b of await candidates("reminderMorningAt", new Date(now.getTime() + HOUR), new Date(now.getTime() + 24 * HOUR))) {
    const tz = b.assignment.course.timezone;
    if (!morningReminderDue({ startsAt: b.slot.startsAt, bookedAt: b.createdAt, timezone: tz, now })) continue;
    const sent = await claim(b, "reminderMorningAt", now, async (tx) => {
      if (!b.student.remindMorning) return false;
      await notify(tx, [b.studentId], {
        type: "booking.reminder",
        title: `Today: ${b.assignment.title} demo at ${fmtTime(b.slot.startsAt, tz, "12h")}`,
        body: `Your ${b.assignment.course.code} demo is today.\n\n${details(b)}`,
        link: pageOf(b),
      });
      return true;
    });
    if (sent) queued++;
  }

  // Ten minutes before: push only, so it reaches the phone without another email or bell item.
  for (const b of await candidates("reminder10mAt", now, new Date(now.getTime() + LAST_REMINDER_MINUTES * MINUTE))) {
    const sent = await claim(b, "reminder10mAt", now, async (tx) => {
      if (!b.student.remind10m || !lastReminderDue({ startsAt: b.slot.startsAt, bookedAt: b.createdAt, now })) return false;
      await notify(tx, [b.studentId], {
        type: "booking.reminder",
        title: `${b.assignment.title} demo in ${LAST_REMINDER_MINUTES} minutes`,
        body: `${venueOf(b)} · with ${b.slot.ta.name}${meetingLine(b)}`,
        link: pageOf(b),
        inApp: false,
        email: false,
        push: true,
      });
      return true;
    });
    if (sent) queued++;
  }
  return queued;
}
