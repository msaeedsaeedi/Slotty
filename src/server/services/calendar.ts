import { buildCalendar, calendarLinks, DEMO_ALARMS_MINUTES, type CalendarEvent } from "@/domain/ics";
import { DomainError } from "@/domain/result";
import { db } from "@/server/db";
import { absoluteUrl } from "@/server/app-url";
import type { Actor } from "./access";

type Venue = { name: string; location: string | null; meetingUrl: string | null } | null;

function where(venue: Venue) {
  if (!venue) return undefined;
  return [venue.name, venue.location, venue.meetingUrl].filter(Boolean).join(", ");
}

const include = {
  slot: { include: { venue: true, ta: { select: { name: true } } } },
  assignment: { include: { course: true } },
  student: { select: { name: true } },
} as const;

function bookingRows(filter: object) {
  return db.booking.findMany({ where: filter, include, orderBy: { slot: { startsAt: "asc" } } });
}

function studentEvent(b: BookingForCalendar): CalendarEvent {
  const url = absoluteUrl(`/courses/${b.assignment.courseId}/assignments/${b.assignmentId}`);
  return {
    // Kept from before the rename to Uniflow (#133): calendar apps match events by UID, so a
    // new suffix would add a second copy of a demo someone already saved.
    uid: `booking-${b.id}@slotty`,
    start: b.slot.startsAt,
    end: b.slot.endsAt,
    summary: `${b.assignment.course.code} demo: ${b.assignment.title}`,
    description: [`With ${b.slot.ta.name}`, b.slot.venue?.meetingUrl ? `Meeting link: ${b.slot.venue.meetingUrl}` : "", url].filter(Boolean).join("\n"),
    location: where(b.slot.venue),
    url,
    alarmsMinutesBefore: DEMO_ALARMS_MINUTES,
  };
}

export type BookingForCalendar = {
  id: string;
  assignmentId: string;
  slot: { startsAt: Date; endsAt: Date; venue: Venue; ta: { name: string } };
  assignment: { title: string; courseId: string; course: { code: string } };
};

/** "Add to calendar" options for one of the student's bookings: Google, Outlook, or an .ics file. */
export function bookingCalendarOptions(b: BookingForCalendar) {
  return { ...calendarLinks(studentEvent(b)), ics: `/bookings/${b.id}/calendar` };
}

/** One booking as a downloadable .ics file (the student's own booking only). */
export async function bookingIcs(actor: Actor, bookingId: string) {
  const [b] = await bookingRows({ id: bookingId, studentId: actor.id, status: { not: "CANCELLED" } });
  if (!b) throw new DomainError("Booking not found.", "NOT_FOUND");
  return { filename: `demo-${b.assignment.course.code.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.ics`, ics: buildCalendar({ name: "Uniflow", events: [studentEvent(b)] }) };
}
