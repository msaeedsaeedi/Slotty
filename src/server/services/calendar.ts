import { buildCalendar, type CalendarEvent } from "@/domain/ics";
import { DomainError } from "@/domain/result";
import { db } from "@/server/db";
import { absoluteUrl } from "@/server/app-url";
import { generateToken } from "@/server/auth/tokens";
import type { Actor } from "./access";

/** Past demos stay in the feed for a while so calendars don't lose them immediately. */
const KEEP_PAST_MS = 30 * 86_400_000;

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

type BookingRow = Awaited<ReturnType<typeof bookingRows>>[number];

function bookingRows(filter: object) {
  return db.booking.findMany({ where: filter, include, orderBy: { slot: { startsAt: "asc" } } });
}

function studentEvent(b: BookingRow): CalendarEvent {
  const url = absoluteUrl(`/courses/${b.assignment.courseId}/assignments/${b.assignmentId}`);
  return {
    uid: `booking-${b.id}@slotty`,
    start: b.slot.startsAt,
    end: b.slot.endsAt,
    summary: `${b.assignment.course.code} demo: ${b.assignment.title}`,
    description: [`With ${b.slot.ta.name}`, b.slot.venue?.meetingUrl ? `Meeting link: ${b.slot.venue.meetingUrl}` : "", url].filter(Boolean).join("\n"),
    location: where(b.slot.venue),
    url,
  };
}

function hostEvent(b: BookingRow): CalendarEvent {
  const url = absoluteUrl(`/courses/${b.assignment.courseId}/manage/assignments/${b.assignmentId}/evaluate/${b.studentId}`);
  return {
    uid: `host-${b.id}@slotty`,
    start: b.slot.startsAt,
    end: b.slot.endsAt,
    summary: `${b.assignment.course.code} demo: ${b.student.name}`,
    description: `${b.assignment.title}\n${url}`,
    location: where(b.slot.venue),
    url,
  };
}

/** One booking as a downloadable .ics file (the student's own booking only). */
export async function bookingIcs(actor: Actor, bookingId: string) {
  const [b] = await bookingRows({ id: bookingId, studentId: actor.id, status: { not: "CANCELLED" } });
  if (!b) throw new DomainError("Booking not found.", "NOT_FOUND");
  return { filename: `demo-${b.assignment.course.code.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.ics`, ics: buildCalendar({ name: "Slotty", events: [studentEvent(b)] }) };
}

/**
 * The personal feed behind /calendar/<token>.ics: the user's own demos plus, for
 * staff, the booked demos they host. Returns null for an unknown token.
 */
export async function calendarFeed(token: string, now = new Date()) {
  const user = await db.user.findUnique({ where: { calendarToken: token } });
  if (!user || user.status !== "ACTIVE") return null;
  const since = new Date(now.getTime() - KEEP_PAST_MS);
  const [mine, hosted] = await Promise.all([
    bookingRows({ studentId: user.id, status: { not: "CANCELLED" }, slot: { startsAt: { gte: since } } }),
    bookingRows({ status: { not: "CANCELLED" }, slot: { taId: user.id, status: { not: "CANCELLED" }, startsAt: { gte: since } } }),
  ]);
  return buildCalendar({ name: `Slotty — ${user.name}`, events: [...mine.map(studentEvent), ...hosted.map(hostEvent)], now });
}

/** Create or replace the feed secret (replacing it breaks any old subscription links). */
export async function rotateCalendarToken(actor: Actor) {
  const token = generateToken();
  await db.user.update({ where: { id: actor.id }, data: { calendarToken: token } });
  return token;
}

export async function getCalendarToken(actor: Actor) {
  const user = await db.user.findUnique({ where: { id: actor.id }, select: { calendarToken: true } });
  return user?.calendarToken ?? null;
}

export const calendarFeedUrl = (token: string) => absoluteUrl(`/calendar/${token}`);
