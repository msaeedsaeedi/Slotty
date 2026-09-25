import Link from "next/link";
import { addDays, format } from "date-fns";
import { TZDate } from "@date-fns/tz";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { markAttendanceAction } from "@/app/actions/bookings";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { EmptyState } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fmt } from "@/lib/time";
import { requireUser } from "@/server/auth/session";
import { load } from "@/server/page-utils";
import { listDayBookings, listOverdueAttendance } from "@/server/services/bookings";
import { getCourseForActor } from "@/server/services/courses";

export const metadata = { title: "Today" };

export default async function TodayPage({ params, searchParams }: PageProps<"/courses/[courseId]/manage/today">) {
  const { courseId } = await params;
  const { date, mine } = await searchParams;
  const user = await requireUser();
  const { course } = await load(getCourseForActor(user, courseId));
  const tz = course.timezone;

  // The selected day, as midnight-to-midnight in the course timezone.
  const today = format(TZDate.tz(tz), "yyyy-MM-dd");
  const day = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today;
  const [y, m, d] = day.split("-").map(Number);
  const start = TZDate.tz(tz, y, m - 1, d);
  const end = addDays(start, 1);
  const onlyMine = mine !== "0";
  const filter = onlyMine ? { taId: user.id } : undefined;
  const [bookings, overdue] = await Promise.all([
    listDayBookings(user, courseId, new Date(start.getTime()), new Date(end.getTime()), filter),
    listOverdueAttendance(user, courseId, filter),
  ]);
  const now = new Date();
  // Days (other than the one shown) with demos still waiting for attendance.
  const overdueDays = new Map<string, { label: string; count: number }>();
  for (const b of overdue) {
    const key = fmt(b.slot.startsAt, tz, "yyyy-MM-dd");
    if (key === day) continue;
    const entry = overdueDays.get(key) ?? { label: fmt(b.slot.startsAt, tz, "EEE d MMM"), count: 0 };
    overdueDays.set(key, { ...entry, count: entry.count + 1 });
  }

  const base = `/courses/${courseId}/manage/today`;
  const q = (next: { date?: string; mine?: boolean }) =>
    `${base}?date=${next.date ?? day}&mine=${(next.mine ?? onlyMine) ? "1" : "0"}`;
  const pending = bookings.filter((b) => b.status === "BOOKED").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="icon-sm" aria-label="Previous day">
          <Link href={q({ date: format(addDays(start, -1), "yyyy-MM-dd") })}>
            <ChevronLeft />
          </Link>
        </Button>
        <h2 className="text-lg font-semibold">{format(start, "EEEE d MMMM")}</h2>
        <Button asChild variant="outline" size="icon-sm" aria-label="Next day">
          <Link href={q({ date: format(addDays(start, 1), "yyyy-MM-dd") })}>
            <ChevronRight />
          </Link>
        </Button>
        {day !== today && (
          <Button asChild variant="ghost" size="sm">
            <Link href={q({ date: today })}>Today</Link>
          </Button>
        )}
        <div className="ml-auto flex rounded-lg border p-0.5 text-sm">
          <Link href={q({ mine: true })} className={`rounded-md px-2.5 py-1 ${onlyMine ? "bg-muted font-medium" : "text-muted-foreground"}`}>
            My demos
          </Link>
          <Link href={q({ mine: false })} className={`rounded-md px-2.5 py-1 ${!onlyMine ? "bg-muted font-medium" : "text-muted-foreground"}`}>
            Everyone
          </Link>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        {bookings.length} demo{bookings.length === 1 ? "" : "s"} · {pending} pending · times in {tz}
      </p>
      {overdueDays.size > 0 && (
        <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <p className="font-medium">Past demos still need attendance:</p>
          <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
            {[...overdueDays].map(([d, { label, count }]) => (
              <Link key={d} className="underline" href={q({ date: d })}>
                {label} ({count})
              </Link>
            ))}
          </p>
        </div>
      )}

      {bookings.length === 0 ? (
        <EmptyState title="No demos booked for this day" />
      ) : (
        <Card className="divide-y p-0">
          {bookings.map((b) => {
            const evalHref = `/courses/${courseId}/manage/assignments/${b.assignment.id}/evaluate/${b.student.id}`;
            const locked = b.evaluation && (b.evaluation.status === "SUBMITTED" || b.evaluation.status === "FINALIZED");
            const notStarted = b.slot.startsAt > now;
            return (
              <div key={b.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="w-24 shrink-0 tabular-nums">
                  <p className="font-semibold">{fmt(b.slot.startsAt, tz, "HH:mm")}</p>
                  <p className="text-xs text-muted-foreground">to {fmt(b.slot.endsAt, tz, "HH:mm")}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{b.student.name}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {b.assignment.title} · {b.slot.venue?.name ?? "No venue"}
                    {!onlyMine && ` · ${b.slot.ta.name}`}
                  </p>
                  {b.slot.venue?.meetingUrl && (
                    <a href={b.slot.venue.meetingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary underline">
                      <ExternalLink className="size-3" /> meeting link
                    </a>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={b.status} label={b.status === "BOOKED" ? "Pending" : undefined} tone={b.status === "BOOKED" ? "neutral" : undefined} />
                  {!locked && (
                    <>
                      {b.status !== "COMPLETED" && (
                        <ActionForm action={markAttendanceAction} compact>
                          <input type="hidden" name="bookingId" value={b.id} />
                          <input type="hidden" name="status" value="COMPLETED" />
                          <SubmitButton size="sm" variant="outline" disabled={notStarted} title={notStarted ? "Available once the demo starts" : undefined}>
                            Completed
                          </SubmitButton>
                        </ActionForm>
                      )}
                      {b.status !== "NO_SHOW" && (
                        <ActionForm action={markAttendanceAction} compact>
                          <input type="hidden" name="bookingId" value={b.id} />
                          <input type="hidden" name="status" value="NO_SHOW" />
                          <SubmitButton size="sm" variant="outline" disabled={notStarted} title={notStarted ? "Available once the demo starts" : undefined}>
                            No-show
                          </SubmitButton>
                        </ActionForm>
                      )}
                      {b.status !== "BOOKED" && (
                        <ActionForm action={markAttendanceAction} compact>
                          <input type="hidden" name="bookingId" value={b.id} />
                          <input type="hidden" name="status" value="BOOKED" />
                          <SubmitButton size="sm" variant="ghost">
                            Undo
                          </SubmitButton>
                        </ActionForm>
                      )}
                    </>
                  )}
                  <Button asChild size="sm">
                    <Link href={`${evalHref}?returnTo=${encodeURIComponent(q({}))}`}>
                      {b.evaluation?.status && b.evaluation.status !== "DRAFT" ? "View marks" : "Mark"}
                    </Link>
                  </Button>
                  {b.evaluation && b.evaluation.status !== "DRAFT" && <StatusBadge status={b.evaluation.status} />}
                </div>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
