import { fmtRange } from "@/lib/time";
import { db } from "@/server/db";
import { notify } from "./notify";

const HOUR = 3_600_000;

const WINDOWS = [
  { field: "reminder24hAt", hours: 24, label: "tomorrow" },
  { field: "reminder1hAt", hours: 1, label: "in about an hour" },
] as const;

/**
 * Queue 24h and 1h reminders for upcoming bookings. Each reminder is sent at most
 * once; a reminder whose window had already started when the student booked is
 * skipped (the confirmation covered it).
 */
export async function queueDueReminders(now = new Date()): Promise<number> {
  let queued = 0;
  for (const w of WINDOWS) {
    const due = await db.booking.findMany({
      where: {
        status: "BOOKED",
        [w.field]: null,
        slot: { status: "PUBLISHED", startsAt: { gt: now, lte: new Date(now.getTime() + w.hours * HOUR) } },
      },
      include: { slot: { include: { venue: true, ta: { select: { name: true } } } }, assignment: { include: { course: true } } },
      take: 500,
    });
    for (const b of due) {
      await db.$transaction(async (tx) => {
        // Claim the reminder; if another worker got there first, skip.
        const claimed = await tx.booking.updateMany({
          where: { id: b.id, status: "BOOKED", [w.field]: null },
          data: { [w.field]: now },
        });
        if (claimed.count === 0) return;
        const bookedLate = b.createdAt.getTime() > b.slot.startsAt.getTime() - w.hours * HOUR;
        if (bookedLate) return;
        const tz = b.assignment.course.timezone;
        const venue = b.slot.venue ? [b.slot.venue.name, b.slot.venue.location].filter(Boolean).join(", ") : "Venue to be announced";
        await notify(tx, [b.studentId], {
          type: "booking.reminder",
          title: `Reminder: ${b.assignment.title} demo ${w.label}`,
          body: `Your ${b.assignment.course.code} demo is ${w.label}.\n\nWhen: ${fmtRange(b.slot.startsAt, b.slot.endsAt, tz)} (${tz})\nWhere: ${venue}${b.slot.venue?.meetingUrl ? `\nMeeting link: ${b.slot.venue.meetingUrl}` : ""}\nWith: ${b.slot.ta.name}`,
          link: `/courses/${b.assignment.courseId}/assignments/${b.assignmentId}`,
        });
        queued++;
      });
    }
  }
  return queued;
}
