import { TZDate } from "@date-fns/tz";
import { addDays, format } from "date-fns";
import { buildTimeline } from "@/domain/demo-day";
import { fmt } from "@/lib/time";
import { db } from "@/server/db";
import { assertStaff, STAFF, type Actor } from "./access";
import { ACTIVE_BOOKING } from "./slots";

export type DemoDayScope = "mine" | "everyone";

/**
 * Courses the actor runs demos in (enrolled as TA or instructor). Admin rights
 * alone don't put other courses' demos on someone's day.
 */
export async function listStaffCourses(actor: Actor) {
  const rows = await db.enrollment.findMany({
    where: { userId: actor.id, role: { in: STAFF }, course: { archived: false } },
    select: { role: true, course: { select: { id: true, code: true, title: true, timezone: true } } },
    orderBy: { course: { code: "asc" } },
  });
  return rows.map((r) => ({ ...r.course, role: r.role }));
}

const dayKey = (d: Date, tz: string) => fmt(d, tz, "yyyy-MM-dd");

function dayBounds(day: string, tz: string) {
  const [y, m, d] = day.split("-").map(Number);
  const start = TZDate.tz(tz, y, m - 1, d);
  return { start: new Date(start.getTime()), end: new Date(addDays(start, 1).getTime()), startTz: start };
}

/**
 * Everything a TA needs to run a demo day: the day's slots on a timeline (now,
 * next, later, done), the coming week at a glance, and loose ends from earlier
 * days (attendance not recorded, marks not finished, open student requests).
 *
 * Without `courseId` it spans every course the actor is staff in; with one it's
 * that course only (admins may view it, as elsewhere in course management).
 */
export async function getDemoDay(
  actor: Actor,
  opts: { courseId?: string; day?: string; scope?: DemoDayScope; now?: Date } = {},
) {
  const now = opts.now ?? new Date();
  const scope = opts.scope ?? "mine";
  let courses: { id: string; code: string; title: string; timezone: string }[];
  if (opts.courseId) {
    await assertStaff(db, actor, opts.courseId);
    courses = await db.course.findMany({ where: { id: opts.courseId }, select: { id: true, code: true, title: true, timezone: true } });
  } else {
    courses = await listStaffCourses(actor);
  }
  const courseIds = courses.map((c) => c.id);
  // Day boundaries follow the (first) course's timezone; demos show their own course's time.
  const timezone = courses[0]?.timezone ?? "UTC";
  const today = dayKey(now, timezone);
  const day = opts.day && /^\d{4}-\d{2}-\d{2}$/.test(opts.day) ? opts.day : today;
  const { start, end, startTz } = dayBounds(day, timezone);
  const week = dayBounds(today, timezone);
  const weekEnd = new Date(addDays(week.startTz, 7).getTime());

  const host = scope === "mine" ? { taId: actor.id } : {};
  const inCourses = { assignment: { courseId: { in: courseIds } } };

  const [slots, weekBookings, nextBooking, overdue, unmarked, requests] = await Promise.all([
    db.slot.findMany({
      where: { ...inCourses, ...host, status: "PUBLISHED", startsAt: { gte: start, lt: end } },
      include: {
        venue: true,
        ta: { select: { id: true, name: true } },
        assignment: { select: { id: true, title: true, courseId: true, course: { select: { code: true, timezone: true } } } },
        bookings: {
          where: { status: { in: [...ACTIVE_BOOKING] } },
          include: {
            student: { select: { id: true, name: true, email: true } },
            evaluation: { select: { id: true, status: true, totalMarks: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { startsAt: "asc" },
    }),
    db.booking.findMany({
      where: { ...inCourses, status: { in: [...ACTIVE_BOOKING] }, slot: { ...host, status: "PUBLISHED", startsAt: { gte: week.start, lt: weekEnd } } },
      select: { slot: { select: { startsAt: true } } },
    }),
    db.booking.findFirst({
      where: { ...inCourses, status: "BOOKED", slot: { ...host, status: "PUBLISHED", startsAt: { gte: end } } },
      select: { slot: { select: { startsAt: true } } },
      orderBy: { slot: { startsAt: "asc" } },
    }),
    db.booking.findMany({
      where: { ...inCourses, status: "BOOKED", slot: { ...host, status: { not: "CANCELLED" }, endsAt: { lt: now } } },
      select: { slot: { select: { startsAt: true } } },
      orderBy: { slot: { startsAt: "asc" } },
    }),
    db.booking.findMany({
      where: {
        ...inCourses,
        status: "COMPLETED",
        slot: host,
        OR: [{ evaluation: null }, { evaluation: { status: { in: ["DRAFT", "RETURNED"] } } }],
      },
      select: {
        id: true,
        student: { select: { id: true, name: true } },
        assignment: { select: { id: true, title: true, courseId: true, course: { select: { code: true } } } },
        slot: { select: { startsAt: true } },
        evaluation: { select: { status: true } },
      },
      orderBy: { slot: { startsAt: "asc" } },
      take: 100,
    }),
    db.studentRequest.findMany({ where: { status: "OPEN", assignment: { courseId: { in: courseIds } } }, select: { assignment: { select: { courseId: true } } } }),
  ]);

  const timeline = buildTimeline(slots, now, { gaps: scope === "mine" });

  const perDay = new Map<string, number>();
  for (const b of weekBookings) perDay.set(dayKey(b.slot.startsAt, timezone), (perDay.get(dayKey(b.slot.startsAt, timezone)) ?? 0) + 1);
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(week.startTz, i);
    const key = format(d, "yyyy-MM-dd");
    return { day: key, label: i === 0 ? "Today" : format(d, "EEE"), date: format(d, "d MMM"), count: perDay.get(key) ?? 0 };
  });

  const attendance = new Map<string, { day: string; label: string; count: number }>();
  for (const b of overdue) {
    const key = dayKey(b.slot.startsAt, timezone);
    const entry = attendance.get(key) ?? { day: key, label: fmt(b.slot.startsAt, timezone, "EEE d MMM"), count: 0 };
    attendance.set(key, { ...entry, count: entry.count + 1 });
  }

  const openRequests = courses
    .map((c) => ({ courseId: c.id, code: c.code, count: requests.filter((r) => r.assignment.courseId === c.id).length }))
    .filter((r) => r.count > 0);

  return {
    courses,
    timezone,
    day,
    today,
    dayLabel: format(startTz, "EEEE d MMMM"),
    prevDay: format(addDays(startTz, -1), "yyyy-MM-dd"),
    nextDay: format(addDays(startTz, 1), "yyyy-MM-dd"),
    scope,
    slots,
    timeline,
    week: weekDays,
    /** First demo after the shown day, for "no demos today — next on …". */
    nextDemoAt: nextBooking?.slot.startsAt ?? null,
    toFinish: { attendance: [...attendance.values()], marking: unmarked, openRequests },
  };
}

export type DemoDay = Awaited<ReturnType<typeof getDemoDay>>;
export type DemoDaySlot = DemoDay["slots"][number];
