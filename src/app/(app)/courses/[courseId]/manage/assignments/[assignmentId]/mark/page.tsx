import { addDays, format, parseISO } from "date-fns";
import { fmt, fmtData, fmtTimeRange, tzLabel } from "@/lib/time";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { load } from "@/server/page-utils";
import { getMarkingSheet } from "@/server/services/evaluations";
import { MarkingSheet, type SheetRow } from "./marking-sheet";

export const metadata = { title: "Marking" };

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

/**
 * Taking demos: one student at a time with next/back, autosaved marks and the
 * day's sheet underneath. Opens on a day (default), on the unfinished marks
 * (`todo=1`), or on one student (`student=…`, who may not have booked).
 */
export default async function MarkPage({ params, searchParams }: PageProps<"/courses/[courseId]/manage/assignments/[assignmentId]/mark">) {
  const { courseId, assignmentId } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  let scope: "mine" | "everyone" = one(sp.scope) === "everyone" ? "everyone" : "mine";
  const studentId = one(sp.student);
  const todo = one(sp.todo) === "1";
  const bookingId = one(sp.booking);
  const back = one(sp.back);
  const base = `/courses/${courseId}/manage/assignments/${assignmentId}`;

  // A link to one booking opens on that booking's day, and on everyone's demos
  // when someone else hosts it (e.g. "Mark" from the Students tab).
  let day = one(sp.day);
  if (bookingId) {
    const b = await db.booking.findUnique({
      where: { id: bookingId },
      select: { slot: { select: { startsAt: true, taId: true } }, assignment: { select: { course: { select: { timezone: true } } } } },
    });
    if (b) {
      day ??= fmtData(b.slot.startsAt, b.assignment.course.timezone, "yyyy-MM-dd");
      if (b.slot.taId !== user.id) scope = "everyone";
    }
  }
  const sheet = await load(getMarkingSheet(user, assignmentId, { day: day && DAY_RE.test(day) ? day : undefined, todo, studentId, scope }));
  const tz = sheet.assignment.course.timezone;
  const now = new Date();
  const today = fmtData(now, tz, "yyyy-MM-dd");
  const shownDay = day && DAY_RE.test(day) ? day : today;
  const mode = studentId ? "student" : todo ? "todo" : "day";

  const rows: SheetRow[] = sheet.rows.map((r) => ({
    student: r.student,
    booking: r.booking && {
      id: r.booking.id,
      status: r.booking.status,
      startsAt: r.booking.startsAt.toISOString(),
      endsAt: r.booking.endsAt.toISOString(),
      time: fmtTimeRange(r.booking.startsAt, r.booking.endsAt, tz),
      day: fmt(r.booking.startsAt, tz, "EEE d MMM"),
      venue: r.booking.venue,
      host: r.booking.host,
    },
    evaluation: r.evaluation,
  }));

  const sheetHref = (q: Record<string, string | undefined>) => {
    const params = new URLSearchParams(Object.entries({ scope: scope === "everyone" ? "everyone" : undefined, back, ...q }).filter(([, v]) => v) as [string, string][]);
    return `${base}/mark?${params}`;
  };
  const dayDate = parseISO(shownDay);
  const title =
    mode === "student"
      ? rows[0]?.student.name ?? "Student"
      : mode === "todo"
        ? "Marks to finish"
        : shownDay === today
          ? `Today · ${format(dayDate, "EEE d MMM")}`
          : format(dayDate, "EEEE d MMMM");

  return (
    <MarkingSheet
      // Remount after a submit refreshes the page, so statuses come from the server again.
      key={sheet.rows.map((r) => `${r.student.id}:${r.evaluation?.status}:${r.booking?.status}`).join("|")}
      assignment={{ id: sheet.assignment.id, title: sheet.assignment.title, maxMarks: sheet.assignment.maxMarks, courseId, courseCode: sheet.assignment.course.code }}
      criteria={sheet.criteria.map((c) => ({ id: c.id, label: c.label, maxPoints: c.maxPoints }))}
      rows={rows}
      hasInstructor={sheet.hasInstructor}
      mode={mode}
      isToday={mode === "day" && shownDay === today}
      title={title}
      timezoneLabel={tzLabel(tz)}
      initialBookingId={bookingId}
      now={now.toISOString()}
      links={{
        back: back?.startsWith("/") && !back.startsWith("//") ? back : base,
        course: `/courses/${courseId}/manage`,
        assignment: base,
        details: `${base}/evaluate`,
        prevDay: mode === "day" ? sheetHref({ day: format(addDays(dayDate, -1), "yyyy-MM-dd") }) : undefined,
        nextDay: mode === "day" ? sheetHref({ day: format(addDays(dayDate, 1), "yyyy-MM-dd") }) : undefined,
        scope:
          mode === "student"
            ? undefined
            : {
                current: scope,
                mine: `${base}/mark?${new URLSearchParams(Object.entries({ day: mode === "day" ? shownDay : undefined, todo: todo ? "1" : undefined, back }).filter(([, v]) => v) as [string, string][])}`,
                everyone: `${base}/mark?${new URLSearchParams(Object.entries({ day: mode === "day" ? shownDay : undefined, todo: todo ? "1" : undefined, back, scope: "everyone" }).filter(([, v]) => v) as [string, string][])}`,
              },
      }}
    />
  );
}
