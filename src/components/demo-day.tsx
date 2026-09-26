import Link from "next/link";
import { CalendarClock, ChevronLeft, ChevronRight, ExternalLink, MapPin } from "lucide-react";
import { markAttendanceAction } from "@/app/actions/bookings";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Countdown, LiveRefresh } from "@/components/live";
import { EmptyState } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Phase } from "@/domain/demo-day";
import { fmt } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { DemoDay, DemoDaySlot } from "@/server/services/demo-day";

type Booking = DemoDaySlot["bookings"][number];

interface ViewProps {
  data: DemoDay;
  now: Date;
  /** Page path the day/scope links point at, e.g. "/today". */
  basePath: string;
  /** Offer "My demos / Everyone" (course view). */
  scopeToggle?: boolean;
}

/**
 * The TA's demo day: who's on now and next, the day as a timeline, the week at a
 * glance, and loose ends to tidy up. Today's view refreshes itself.
 */
export function DemoDayView({ data, now, basePath, scopeToggle }: ViewProps) {
  const { timeline, timezone, day, today } = data;
  const isToday = day === today;
  const href = (next: { day?: string; scope?: string }) => {
    const q = new URLSearchParams();
    const d = next.day ?? day;
    if (d !== today) q.set("day", d);
    const s = next.scope ?? data.scope;
    if (s !== "mine") q.set("scope", s);
    const qs = q.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  const dayHref = (d: string) => href({ day: d });
  const returnTo = href({});
  const multiCourse = data.courses.length > 1;
  const everyone = data.scope === "everyone";
  const ctx: RowContext = { now, timezone, returnTo, multiCourse, everyone };
  const { stats } = timeline;

  return (
    <div className="space-y-5">
      {isToday && <LiveRefresh />}

      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="icon-sm" aria-label="Previous day">
          <Link href={href({ day: data.prevDay })}>
            <ChevronLeft />
          </Link>
        </Button>
        <h2 className="text-lg font-semibold">{isToday ? `Today · ${data.dayLabel}` : data.dayLabel}</h2>
        <Button asChild variant="outline" size="icon-sm" aria-label="Next day">
          <Link href={href({ day: data.nextDay })}>
            <ChevronRight />
          </Link>
        </Button>
        {!isToday && (
          <Button asChild variant="ghost" size="sm">
            <Link href={href({ day: today })}>Back to today</Link>
          </Button>
        )}
        {scopeToggle && (
          <div className="ml-auto flex rounded-lg border p-0.5 text-sm" role="group" aria-label="Whose demos">
            {(["mine", "everyone"] as const).map((s) => (
              <Link
                key={s}
                href={href({ scope: s })}
                aria-current={data.scope === s ? "true" : undefined}
                className={cn("rounded-md px-3 py-1.5", data.scope === s ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground")}
              >
                {s === "mine" ? "My demos" : "Everyone"}
              </Link>
            ))}
          </div>
        )}
      </div>

      <WeekStrip week={data.week} selected={day} href={dayHref} />

      <p className="text-sm text-muted-foreground">
        {stats.demos === 0
          ? "No demos booked"
          : [
              `${stats.demos} demo${stats.demos === 1 ? "" : "s"}`,
              stats.completed && `${stats.completed} completed`,
              stats.noShow && `${stats.noShow} no-show`,
              stats.needsAttendance && `${stats.needsAttendance} need${stats.needsAttendance === 1 ? "s" : ""} attendance`,
              stats.remaining && `${stats.remaining} to go`,
            ]
              .filter(Boolean)
              .join(" · ")}{" "}
        · times in {timezone}
      </p>

      {isToday && <Focus data={data} ctx={ctx} dayHref={dayHref} />}

      {timeline.items.length === 0 ? (
        !isToday && (
          <EmptyState title="No demos on this day">
            <NextDemoHint data={data} dayHref={dayHref} />
          </EmptyState>
        )
      ) : (
        <section aria-label="Timeline">
          <Card className="gap-0 divide-y p-0">
            {timeline.items.map((item) =>
              item.kind === "gap" ? (
                <div key={`gap-${item.from.getTime()}`} className="flex items-center gap-3 bg-muted/30 px-3 py-2 text-xs text-muted-foreground sm:px-4">
                  <span className="w-14 shrink-0 tabular-nums sm:w-24">
                    {fmt(item.from, timezone, "HH:mm")}–{fmt(item.to, timezone, "HH:mm")}
                  </span>
                  <span>Free · {duration(item.to.getTime() - item.from.getTime())}</span>
                </div>
              ) : (
                <SlotRow key={item.slot.id} slot={item.slot} phase={item.phase} ctx={ctx} />
              ),
            )}
          </Card>
          {timeline.hiddenEmptyPast > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              {timeline.hiddenEmptyPast} earlier slot{timeline.hiddenEmptyPast === 1 ? "" : "s"} had no bookings.
            </p>
          )}
        </section>
      )}

      <LooseEnds data={data} dayHref={dayHref} returnTo={returnTo} />
    </div>
  );
}

/** Dashboard card for staff: today at a glance, one tap into the demo day. */
export function DemoDaySummary({ data, now }: { data: DemoDay; now: Date }) {
  const { stats } = data.timeline;
  const iso = now.toISOString();
  const who = (slot: DemoDaySlot) => `${slot.bookings.map((b) => b.student.name).join(", ")} (${slot.assignment.course.code})`;
  const loose = [
    data.toFinish.attendance.length > 0 && `${data.toFinish.attendance.reduce((n, a) => n + a.count, 0)} need attendance`,
    data.toFinish.marking.length > 0 &&
      `${data.toFinish.marking.length}${data.toFinish.marking.length === 100 ? "+" : ""} mark${data.toFinish.marking.length === 1 ? "" : "s"} to finish`,
    data.toFinish.openRequests.length > 0 && `${data.toFinish.openRequests.reduce((n, r) => n + r.count, 0)} student requests`,
  ].filter(Boolean);

  const { focus } = data.timeline;
  let headline: React.ReactNode;
  if (focus.kind === "now") {
    headline = (
      <>
        <span className="font-semibold">Now:</span> {focus.slots.map(who).join(" · ")} —{" "}
        <Countdown to={focus.slots[0].endsAt.toISOString()} now={iso} mode="left" />
      </>
    );
  } else if (focus.kind === "next") {
    const s = focus.slots[0];
    headline = (
      <>
        <span className="font-semibold">Next:</span> {fmt(s.startsAt, s.assignment.course.timezone, "HH:mm")} {focus.slots.map(who).join(" · ")} —{" "}
        <Countdown to={s.startsAt.toISOString()} now={iso} mode="until" />
      </>
    );
  } else if (focus.kind === "done") {
    headline = <>All {stats.demos} demos for today are done.</>;
  } else {
    headline = data.nextDemoAt ? <>No demos today · next on {fmt(data.nextDemoAt, data.timezone, "EEE d MMM 'at' HH:mm")}</> : <>No demos booked yet.</>;
  }

  return (
    <Card className="gap-3 p-4 sm:flex-row sm:items-center">
      <CalendarClock className="hidden size-8 shrink-0 text-primary sm:block" aria-hidden />
      <div className="min-w-0 flex-1 space-y-1 text-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Today{stats.demos > 0 && ` · ${stats.demos} demo${stats.demos === 1 ? "" : "s"}, ${stats.remaining} to go`}
        </p>
        <p className="text-base">{headline}</p>
        {loose.length > 0 && <p className="text-amber-700 dark:text-amber-400">To finish: {loose.join(" · ")}</p>}
      </div>
      <Button asChild className="shrink-0">
        <Link href="/today">Open demo day</Link>
      </Button>
    </Card>
  );
}

// ─── Now / next ──────────────────────────────────────────────────────────────

interface RowContext {
  now: Date;
  timezone: string;
  returnTo: string;
  multiCourse: boolean;
  everyone: boolean;
}

function Focus({ data, ctx, dayHref }: { data: DemoDay; ctx: RowContext; dayHref: (day: string) => string }) {
  const { focus, stats, idleNow } = data.timeline;
  const iso = ctx.now.toISOString();

  // What follows the demo(s) in focus, for the side list.
  const focused = new Set(focus.kind === "now" || focus.kind === "next" ? focus.slots.map((s) => s.id) : []);
  const queue = data.timeline.items.flatMap((i) =>
    i.kind === "slot" && (i.phase === "next" || i.phase === "later") && i.slot.bookings.length > 0 && !focused.has(i.slot.id) ? [i.slot] : [],
  );
  const upcoming = queue.slice(0, 4);
  const remainingAfter = queue.length - upcoming.length;

  if (focus.kind === "empty") {
    return (
      <EmptyState title="No demos today">
        <NextDemoHint data={data} dayHref={dayHref} />
      </EmptyState>
    );
  }
  if (focus.kind === "done") {
    return (
      <div role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
        <p className="font-medium">That&apos;s all the demos for today.</p>
        {stats.needsAttendance > 0 && <p>{stats.needsAttendance} still need attendance recorded — see the timeline below.</p>}
      </div>
    );
  }

  return (
    <div className="grid gap-3 lg:grid-cols-[3fr_2fr]">
      {focus.kind === "now"
        ? focus.slots.map((slot) => (
            <FocusCard key={slot.id} slot={slot} ctx={ctx} label="Now" tone="now">
              <Countdown to={slot.endsAt.toISOString()} now={iso} mode="left" />
            </FocusCard>
          ))
        : focus.slots.map((slot) => (
            <FocusCard key={slot.id} slot={slot} ctx={ctx} label={idleNow ? "Free now · up next" : "Up next"} tone="next">
              starts <Countdown to={slot.startsAt.toISOString()} now={iso} mode="until" />
            </FocusCard>
          ))}
      {upcoming.length > 0 && (
        <Card className="gap-2 p-4 text-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Coming up</p>
          <ul className="space-y-1.5">
            {upcoming.map((slot) => (
              <li key={slot.id} className="flex gap-2">
                <span className="w-12 shrink-0 font-semibold tabular-nums">{fmt(slot.startsAt, slot.assignment.course.timezone, "HH:mm")}</span>
                <span className="min-w-0">
                  {slot.bookings.map((b) => b.student.name).join(", ")}
                  <span className="block truncate text-xs text-muted-foreground">
                    {ctx.multiCourse && `${slot.assignment.course.code} · `}
                    {slot.assignment.title}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          {remainingAfter > 0 && <p className="text-xs text-muted-foreground">+{remainingAfter} more later today</p>}
        </Card>
      )}
    </div>
  );
}

function FocusCard({ slot, ctx, label, tone, children }: { slot: DemoDaySlot; ctx: RowContext; label: string; tone: "now" | "next"; children: React.ReactNode }) {
  const tz = slot.assignment.course.timezone;
  const venue = slot.venue;
  return (
    <Card
      className={cn("gap-3 p-4", tone === "now" ? "border-primary ring-1 ring-primary/30" : "border-blue-300 dark:border-blue-900")}
      aria-label={`${label}: ${slot.bookings.map((b) => b.student.name).join(", ")}`}
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", tone === "now" ? "bg-primary text-primary-foreground" : "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200")}>
          {label}
        </span>
        <span className="font-medium tabular-nums">
          {fmt(slot.startsAt, tz, "HH:mm")}–{fmt(slot.endsAt, tz, "HH:mm")}
        </span>
        <span className="text-muted-foreground">{children}</span>
      </div>
      <p className="text-sm text-muted-foreground">
        {slot.assignment.course.code} · {slot.assignment.title}
        {ctx.everyone && ` · host ${slot.ta.name}`}
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="flex items-center gap-1.5">
          <MapPin className="size-4 text-muted-foreground" aria-hidden />
          {venue ? [venue.name, venue.location].filter(Boolean).join(", ") : "No venue"}
        </span>
        {venue?.meetingUrl && (
          <Button asChild size="sm" variant="outline">
            <a href={venue.meetingUrl} target="_blank" rel="noreferrer">
              <ExternalLink /> Join meeting
            </a>
          </Button>
        )}
      </div>
      <ul className="space-y-3 border-t pt-3">
        {slot.bookings.map((b) => (
          <li key={b.id} className="flex flex-wrap items-center gap-2">
            <div className="mr-auto min-w-0">
              <p className="text-lg font-semibold leading-tight">{b.student.name}</p>
              <p className="truncate text-xs text-muted-foreground">{b.student.email}</p>
            </div>
            <BookingActions booking={b} slot={slot} ctx={ctx} started={tone === "now"} prominent />
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ─── Timeline rows ───────────────────────────────────────────────────────────

const PHASE_STYLE: Record<Phase, string> = {
  done: "text-muted-foreground",
  now: "border-l-4 border-l-primary bg-primary/5",
  next: "border-l-4 border-l-blue-400",
  later: "",
};
const PHASE_LABEL: Partial<Record<Phase, string>> = { now: "Now", next: "Next" };

function SlotRow({ slot, phase, ctx }: { slot: DemoDaySlot; phase: Phase; ctx: RowContext }) {
  const tz = slot.assignment.course.timezone;
  const otherTz = tz !== ctx.timezone;
  const started = phase === "done" || phase === "now";
  return (
    <div id={phase === "now" ? "now" : undefined} className={cn("flex items-start gap-3 px-3 py-3 sm:px-4", PHASE_STYLE[phase])}>
      <div className="w-14 shrink-0 tabular-nums sm:w-24">
        <p className={cn("font-semibold", phase === "done" && "font-normal")}>{fmt(slot.startsAt, tz, "HH:mm")}</p>
        <p className="text-xs text-muted-foreground">
          to {fmt(slot.endsAt, tz, "HH:mm")}
          {otherTz && ` (${tz})`}
        </p>
        {PHASE_LABEL[phase] && <p className="mt-0.5 text-xs font-semibold text-primary">{PHASE_LABEL[phase]}</p>}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="truncate text-xs text-muted-foreground">
          {ctx.multiCourse && `${slot.assignment.course.code} · `}
          {slot.assignment.title} · {slot.venue?.name ?? "No venue"}
          {ctx.everyone && ` · ${slot.ta.name}`}
          {slot.venue?.meetingUrl && (
            <>
              {" · "}
              <a href={slot.venue.meetingUrl} target="_blank" rel="noreferrer" className="text-primary underline">
                meeting link
              </a>
            </>
          )}
        </p>
        {slot.bookings.length === 0 ? (
          <p className="text-sm text-muted-foreground">Open slot — nobody booked</p>
        ) : (
          slot.bookings.map((b) => (
            <div key={b.id} className="flex flex-wrap items-center gap-2">
              <p className={cn("mr-auto font-medium", phase === "done" && "text-foreground")}>{b.student.name}</p>
              <BookingActions booking={b} slot={slot} ctx={ctx} started={started} ended={phase === "done"} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/**
 * Attendance and marking for one student. Attendance only appears once the demo
 * has started (it can't be recorded earlier), so there are no dead buttons.
 */
function BookingActions({
  booking: b,
  slot,
  ctx,
  started,
  ended,
  prominent,
}: {
  booking: Booking;
  slot: DemoDaySlot;
  ctx: RowContext;
  started: boolean;
  ended?: boolean;
  prominent?: boolean;
}) {
  const evalHref = `/courses/${slot.assignment.courseId}/manage/assignments/${slot.assignment.id}/evaluate/${b.student.id}?returnTo=${encodeURIComponent(ctx.returnTo)}`;
  const evaluation = b.evaluation;
  const locked = evaluation?.status === "SUBMITTED" || evaluation?.status === "FINALIZED";
  const markLabel = locked ? "View marks" : evaluation ? "Continue marking" : "Mark";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {b.status !== "BOOKED" && <StatusBadge status={b.status} />}
      {b.status === "BOOKED" && ended && <StatusBadge status="PENDING" label="Attendance?" tone="warning" />}
      {evaluation && evaluation.status !== "DRAFT" && <StatusBadge status={evaluation.status} />}
      {evaluation?.status === "DRAFT" && <StatusBadge status="DRAFT" label="Marks in draft" />}

      {started && !locked && b.status === "BOOKED" && (
        <>
          <ActionForm action={markAttendanceAction} compact>
            <input type="hidden" name="bookingId" value={b.id} />
            <input type="hidden" name="status" value="COMPLETED" />
            <input type="hidden" name="next" value={evalHref} />
            <SubmitButton size="sm" variant={prominent ? "default" : "outline"}>
              Completed → mark
            </SubmitButton>
          </ActionForm>
          <ActionForm
            action={markAttendanceAction}
            compact
            confirm={`Mark ${b.student.name} as a no-show? They'll get an email saying they missed their demo. You can undo this.`}
            confirmLabel="Mark no-show"
          >
            <input type="hidden" name="bookingId" value={b.id} />
            <input type="hidden" name="status" value="NO_SHOW" />
            <SubmitButton size="sm" variant="outline">
              No-show
            </SubmitButton>
          </ActionForm>
        </>
      )}
      {!locked && b.status !== "BOOKED" && (
        <ActionForm action={markAttendanceAction} compact>
          <input type="hidden" name="bookingId" value={b.id} />
          <input type="hidden" name="status" value="BOOKED" />
          <SubmitButton size="sm" variant="ghost" aria-label={`Undo attendance for ${b.student.name}`}>
            Undo
          </SubmitButton>
        </ActionForm>
      )}
      {(b.status !== "BOOKED" || !started) && b.status !== "NO_SHOW" && (
        <Button asChild size="sm" variant={b.status === "COMPLETED" && !locked ? "default" : "outline"}>
          <Link href={evalHref}>{markLabel}</Link>
        </Button>
      )}
    </div>
  );
}

// ─── Week, loose ends ────────────────────────────────────────────────────────

function WeekStrip({ week, selected, href }: { week: DemoDay["week"]; selected: string; href: (day: string) => string }) {
  return (
    <nav aria-label="This week" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {week.map((d) => (
        <Link
          key={d.day}
          href={href(d.day)}
          aria-current={d.day === selected ? "date" : undefined}
          aria-label={`${d.label} ${d.date}: ${d.count} demo${d.count === 1 ? "" : "s"}`}
          className={cn(
            "flex min-w-16 flex-1 flex-col items-center rounded-lg border px-2 py-1.5 text-xs",
            d.day === selected ? "border-primary bg-primary/10" : "hover:bg-muted/60",
          )}
        >
          <span className="font-medium">{d.label}</span>
          <span className="text-muted-foreground">{d.date}</span>
          <span className={cn("mt-0.5 text-sm font-semibold tabular-nums", d.count === 0 && "font-normal text-muted-foreground")}>{d.count || "–"}</span>
        </Link>
      ))}
    </nav>
  );
}

function NextDemoHint({ data, dayHref }: { data: DemoDay; dayHref: (day: string) => string }) {
  if (!data.nextDemoAt) return <>Nothing booked after this day yet.</>;
  return (
    <>
      Next demos:{" "}
      <Link className="underline" href={dayHref(fmt(data.nextDemoAt, data.timezone, "yyyy-MM-dd"))}>
        {fmt(data.nextDemoAt, data.timezone, "EEEE d MMMM 'from' HH:mm")}
      </Link>
    </>
  );
}

function LooseEnds({ data, dayHref, returnTo }: { data: DemoDay; dayHref: (day: string) => string; returnTo: string }) {
  const { attendance, marking, openRequests } = data.toFinish;
  const pastAttendance = attendance.filter((a) => a.day !== data.day);
  if (pastAttendance.length === 0 && marking.length === 0 && openRequests.length === 0) return null;
  return (
    <section aria-labelledby="loose-ends" className="space-y-3">
      <h3 id="loose-ends" className="text-sm font-semibold">
        To finish
      </h3>
      <div className="grid gap-3 md:grid-cols-2">
        {pastAttendance.length > 0 && (
          <Card className="gap-2 p-4 text-sm">
            <p className="font-medium">
              <CalendarClock className="mr-1.5 inline size-4 align-text-bottom text-amber-600" aria-hidden />
              Attendance not recorded
            </p>
            <p className="flex flex-wrap gap-x-3 gap-y-1">
              {pastAttendance.map((a) => (
                <Link key={a.day} className="underline" href={dayHref(a.day)}>
                  {a.label} ({a.count})
                </Link>
              ))}
            </p>
          </Card>
        )}
        {openRequests.length > 0 && (
          <Card className="gap-2 p-4 text-sm">
            <p className="font-medium">Student requests waiting</p>
            <p className="flex flex-wrap gap-x-3 gap-y-1">
              {openRequests.map((r) => (
                <Link key={r.courseId} className="underline" href={`/courses/${r.courseId}/manage/requests`}>
                  {r.code} ({r.count})
                </Link>
              ))}
            </p>
          </Card>
        )}
        {marking.length > 0 && (
          <Card className="gap-2 p-4 text-sm md:col-span-2">
            <p className="font-medium">
              Marks to finish <span className="font-normal text-muted-foreground">({marking.length}{marking.length === 100 ? "+" : ""})</span>
            </p>
            <ul className="divide-y">
              {marking.slice(0, 8).map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="mr-auto min-w-0">
                    <span className="font-medium">{b.student.name}</span>{" "}
                    <span className="text-muted-foreground">
                      · {b.assignment.course.code} {b.assignment.title} · {fmt(b.slot.startsAt, data.timezone, "EEE d MMM")}
                    </span>
                  </span>
                  <StatusBadge status={b.evaluation?.status ?? "NONE"} label={b.evaluation ? undefined : "Not started"} />
                  <Button asChild size="sm" variant="outline">
                    <Link
                      href={`/courses/${b.assignment.courseId}/manage/assignments/${b.assignment.id}/evaluate/${b.student.id}?returnTo=${encodeURIComponent(returnTo)}`}
                    >
                      {b.evaluation ? "Continue" : "Mark"}
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
            {marking.length > 8 && <p className="text-xs text-muted-foreground">…and {marking.length - 8} more (oldest first).</p>}
          </Card>
        )}
      </div>
    </section>
  );
}

function duration(ms: number) {
  const min = Math.round(ms / 60_000);
  const h = Math.floor(min / 60);
  return h ? `${h} h${min % 60 ? ` ${min % 60} min` : ""}` : `${min} min`;
}
