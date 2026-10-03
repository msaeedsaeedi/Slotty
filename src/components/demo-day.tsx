import Link from "next/link";
import { CalendarClock, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ExternalLink, MapPin, PenLine } from "lucide-react";
import { markAttendanceAction } from "@/app/actions/bookings";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Countdown, LiveRefresh } from "@/components/live";
import { EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Phase } from "@/domain/demo-day";
import { fmt, fmtTime, fmtTimeRange } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { DayState, DemoDay, DemoDaySlot } from "@/server/services/demo-day";

type Booking = DemoDaySlot["bookings"][number];

interface ViewProps {
  data: DemoDay;
  now: Date;
  /** Page path the day/scope links point at, e.g. "/today". */
  basePath: string;
  /** Offer "My demos / Everyone" (course view). */
  scopeToggle?: boolean;
}

// ─── Status: one vocabulary (and one colour each) for rows, pills and the calendar ─

type Tone = "danger" | "warning" | "info" | "live" | "success" | "muted";

const TONE: Record<Tone, { pill: string; stripe: string; dot: string }> = {
  danger: { pill: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200", stripe: "before:bg-red-500", dot: "bg-red-500" },
  warning: { pill: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200", stripe: "before:bg-amber-500", dot: "bg-amber-500" },
  info: { pill: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200", stripe: "before:bg-blue-500", dot: "bg-blue-500" },
  live: { pill: "bg-primary text-primary-foreground", stripe: "before:bg-primary", dot: "bg-primary" },
  success: { pill: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200", stripe: "before:bg-emerald-500", dot: "bg-emerald-500" },
  muted: { pill: "bg-muted text-muted-foreground", stripe: "before:bg-muted-foreground/40", dot: "bg-muted-foreground/40" },
};

/** Where one booked demo stands, in words and colour. */
function demoStatus(b: Booking, phase: Phase): { label: string; tone: Tone } {
  if (b.status === "NO_SHOW") return { label: "No-show", tone: "muted" };
  if (b.status === "BOOKED") {
    if (phase === "done") return { label: "Attendance missing", tone: "danger" };
    if (phase === "now") return { label: "In progress", tone: "live" };
    return { label: "Booked", tone: "info" };
  }
  const ev = b.evaluation?.status;
  if (ev === "FINALIZED") return { label: "Marked", tone: "success" };
  if (ev === "SUBMITTED") return { label: "Marks submitted", tone: "success" };
  if (ev === "RETURNED") return { label: "Marks returned", tone: "warning" };
  return { label: ev === "DRAFT" ? "Marks in draft" : "To mark", tone: "warning" };
}

const DAY_STATE: Record<Exclude<DayState, "none">, { label: string; tone: Tone }> = {
  overdue: { label: "Attendance missing", tone: "danger" },
  marking: { label: "Marks to finish", tone: "warning" },
  scheduled: { label: "Demos booked", tone: "info" },
  done: { label: "All done", tone: "success" },
};

function Pill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", TONE[tone].pill)}>{children}</span>;
}

/** The focused marking page for one assignment, opened on a given student. */
export function markHref(a: { id: string; courseId: string }, opts: { day?: string; bookingId?: string; studentId?: string; everyone?: boolean; back?: string } = {}) {
  const q = new URLSearchParams();
  if (opts.day) q.set("day", opts.day);
  if (opts.bookingId) q.set("booking", opts.bookingId);
  if (opts.studentId) q.set("student", opts.studentId);
  if (opts.everyone) q.set("scope", "everyone");
  if (opts.back) q.set("back", opts.back);
  return `/courses/${a.courseId}/manage/assignments/${a.id}/mark?${q}`;
}

/**
 * The TA's demo day: who's on now and next, the day's slots grouped by
 * assignment, a colour-coded week, and loose ends. Today's view refreshes itself.
 */
export function DemoDayView({ data, now, basePath, scopeToggle }: ViewProps) {
  const { timeline, day, today } = data;
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
  const ctx: RowContext = { now, day, back: href({}), everyone: data.scope === "everyone" };
  const { stats } = timeline;

  // Consecutive slots of one assignment share a header (course › assignment, venue).
  const groups: { assignment: DemoDaySlot["assignment"]; items: typeof timeline.items }[] = [];
  for (const item of timeline.items) {
    const last = groups.at(-1);
    if (item.kind === "gap") {
      last?.items.push(item);
      continue;
    }
    if (last && last.assignment.id === item.slot.assignment.id) last.items.push(item);
    else groups.push({ assignment: item.slot.assignment, items: [item] });
  }

  return (
    <div className="space-y-5">
      {isToday && <LiveRefresh />}

      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="icon-sm" aria-label="Previous day">
          <Link href={href({ day: data.prevDay })}>
            <ChevronLeft />
          </Link>
        </Button>
        <h2 className="min-w-0 text-lg font-semibold">{isToday ? `Today · ${data.dayLabel}` : data.dayLabel}</h2>
        <Button asChild variant="outline" size="icon-sm" aria-label="Next day">
          <Link href={href({ day: data.nextDay })}>
            <ChevronRight />
          </Link>
        </Button>
        {!isToday && (
          <Button asChild variant="ghost" size="sm">
            <Link href={href({ day: today })}>Today</Link>
          </Button>
        )}
        {scopeToggle && (
          <div className="ml-auto flex rounded-lg border p-0.5 text-sm" role="group" aria-label="Whose demos">
            {(["mine", "everyone"] as const).map((s) => (
              <Link
                key={s}
                href={href({ scope: s })}
                aria-current={data.scope === s ? "true" : undefined}
                className={cn("rounded-md px-3 py-1", data.scope === s ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground")}
              >
                {s === "mine" ? "My demos" : "Everyone"}
              </Link>
            ))}
          </div>
        )}
      </div>

      <WeekStrip data={data} href={dayHref} />

      {stats.demos > 0 && (
        <p className="flex flex-wrap gap-1.5 text-sm" aria-label="Day summary">
          <Pill tone="muted">{stats.demos} booked</Pill>
          {stats.completed > 0 && <Pill tone="success">{stats.completed} attended</Pill>}
          {stats.noShow > 0 && <Pill tone="muted">{stats.noShow} no-show</Pill>}
          {stats.needsAttendance > 0 && <Pill tone="danger">{stats.needsAttendance} attendance missing</Pill>}
          {stats.remaining > 0 && <Pill tone="info">{stats.remaining} to go</Pill>}
        </p>
      )}

      {isToday && <Focus data={data} ctx={ctx} dayHref={dayHref} />}

      {groups.length === 0 ? (
        !isToday && (
          <EmptyState title="No demos on this day">
            <NextDemoHint data={data} dayHref={dayHref} />
          </EmptyState>
        )
      ) : (
        <div className="space-y-4">
          {groups.map((g, i) => (
            <AssignmentGroup key={`${g.assignment.id}-${i}`} assignment={g.assignment} items={g.items} ctx={ctx} />
          ))}
          {timeline.hiddenEmptyPast > 0 && (
            <p className="text-xs text-muted-foreground">
              {timeline.hiddenEmptyPast} earlier slot{timeline.hiddenEmptyPast === 1 ? "" : "s"} had no bookings.
            </p>
          )}
        </div>
      )}

      <LooseEnds data={data} dayHref={dayHref} back={ctx.back} />
    </div>
  );
}

/** Dashboard card for staff: today at a glance, one tap into the demo day. */
export function DemoDaySummary({ data, now }: { data: DemoDay; now: Date }) {
  const { stats } = data.timeline;
  const iso = now.toISOString();
  const who = (slot: DemoDaySlot) => `${slot.bookings.map((b) => b.student.name).join(", ")} (${slot.assignment.course.code})`;
  const attendance = data.toFinish.attendance.reduce((n, a) => n + a.count, 0);

  const { focus } = data.timeline;
  let headline: React.ReactNode;
  if (focus.kind === "now") {
    headline = (
      <>
        <span className="font-semibold">Now:</span> {focus.slots.map(who).join(" · ")} — <Countdown to={focus.slots[0].endsAt.toISOString()} now={iso} mode="left" />
      </>
    );
  } else if (focus.kind === "next") {
    const s = focus.slots[0];
    headline = (
      <>
        <span className="font-semibold">Next:</span> {fmtTime(s.startsAt, s.assignment.course.timezone)} {focus.slots.map(who).join(" · ")} —{" "}
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
          Demo day{stats.demos > 0 && ` · ${stats.demos} today, ${stats.remaining} to go`}
        </p>
        <p className="text-base">{headline}</p>
        {attendance > 0 && <p className="text-red-700 dark:text-red-400">{attendance} past demo{attendance === 1 ? " has" : "s have"} no attendance recorded</p>}
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
  day: string;
  /** Link back to this view (from the marking page). */
  back: string;
  everyone: boolean;
}

function Focus({ data, ctx, dayHref }: { data: DemoDay; ctx: RowContext; dayHref: (day: string) => string }) {
  const { focus, stats, idleNow } = data.timeline;
  const iso = ctx.now.toISOString();
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
        {stats.needsAttendance > 0 && <p>{stats.needsAttendance} still need attendance recorded — they&apos;re marked in red below.</p>}
      </div>
    );
  }
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {focus.slots.map((slot) => (
        <FocusCard key={slot.id} slot={slot} ctx={ctx} live={focus.kind === "now"} label={focus.kind === "now" ? "Now" : idleNow ? "Free now · up next" : "Up next"}>
          {focus.kind === "now" ? (
            <Countdown to={slot.endsAt.toISOString()} now={iso} mode="left" />
          ) : (
            <>
              starts <Countdown to={slot.startsAt.toISOString()} now={iso} mode="until" />
            </>
          )}
        </FocusCard>
      ))}
    </div>
  );
}

function FocusCard({ slot, ctx, label, live, children }: { slot: DemoDaySlot; ctx: RowContext; label: string; live: boolean; children: React.ReactNode }) {
  const tz = slot.assignment.course.timezone;
  const venue = slot.venue;
  return (
    <Card className={cn("gap-3 p-4", live ? "border-primary ring-1 ring-primary/30" : "border-blue-300 dark:border-blue-900")}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Pill tone={live ? "live" : "info"}>{label}</Pill>
        <span className="font-medium tabular-nums">{fmtTimeRange(slot.startsAt, slot.endsAt, tz)}</span>
        <span className="text-muted-foreground">{children}</span>
      </div>
      {slot.bookings.map((b) => (
        <div key={b.id} className="flex flex-wrap items-center gap-2">
          <p className="mr-auto text-lg font-semibold leading-tight">{b.student.name}</p>
          <BookingActions booking={b} slot={slot} ctx={ctx} started={live} prominent />
        </div>
      ))}
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <AssignmentLinks assignment={slot.assignment} />
        <span className="flex items-center gap-1">
          <MapPin className="size-3.5" aria-hidden />
          {venue ? venue.name : "No venue"}
        </span>
        {venue?.meetingUrl && (
          <a href={venue.meetingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline">
            <ExternalLink className="size-3.5" /> Join meeting
          </a>
        )}
      </p>
    </Card>
  );
}

function AssignmentLinks({ assignment: a }: { assignment: DemoDaySlot["assignment"] }) {
  return (
    <span className="min-w-0 truncate">
      <Link href={`/courses/${a.courseId}/manage`} className="font-medium hover:underline">
        {a.course.code}
      </Link>
      {" › "}
      <Link href={`/courses/${a.courseId}/manage/assignments/${a.id}`} className="hover:underline">
        {a.title}
      </Link>
    </span>
  );
}

// ─── The day, grouped by assignment ──────────────────────────────────────────

function AssignmentGroup({ assignment, items, ctx }: { assignment: DemoDaySlot["assignment"]; items: DemoDay["timeline"]["items"]; ctx: RowContext }) {
  const slots = items.flatMap((i) => (i.kind === "slot" ? [i.slot] : []));
  const venues = [...new Set(slots.map((s) => s.venue?.name ?? "No venue"))];
  const sharedVenue = venues.length === 1 ? venues[0] : null;
  const hosts = [...new Set(slots.map((s) => s.ta.name))];
  const firstBooking = slots.flatMap((s) => s.bookings)[0];
  return (
    <section aria-label={`${assignment.course.code} ${assignment.title}`} className="overflow-hidden rounded-xl border bg-card">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-muted/40 px-3 py-2 text-sm sm:px-4">
        <AssignmentLinks assignment={assignment} />
        {sharedVenue && (
          <span className="flex items-center gap-1 text-muted-foreground">
            <MapPin className="size-3.5" aria-hidden /> {sharedVenue}
          </span>
        )}
        {ctx.everyone && hosts.length === 1 && <span className="text-muted-foreground">Host: {hosts[0]}</span>}
        {firstBooking && (
          <Button asChild size="sm" variant="outline" className="ml-auto">
            <Link href={markHref(assignment, { day: ctx.day, everyone: ctx.everyone, back: ctx.back })}>
              <PenLine /> Marking sheet
            </Link>
          </Button>
        )}
      </header>
      <ol className="divide-y">
        {items.map((item) =>
          item.kind === "gap" ? (
            <li key={`gap-${item.from.getTime()}`} className="px-3 py-1.5 text-xs text-muted-foreground sm:px-4">
              Free {fmtTimeRange(item.from, item.to, assignment.course.timezone)}
            </li>
          ) : (
            <SlotRow key={item.slot.id} slot={item.slot} phase={item.phase} ctx={ctx} showVenue={!sharedVenue} showHost={ctx.everyone && hosts.length > 1} />
          ),
        )}
      </ol>
    </section>
  );
}

function SlotRow({ slot, phase, ctx, showVenue, showHost }: { slot: DemoDaySlot; phase: Phase; ctx: RowContext; showVenue: boolean; showHost: boolean }) {
  const tz = slot.assignment.course.timezone;
  const time = fmtTimeRange(slot.startsAt, slot.endsAt, tz);
  const extra = [showVenue && (slot.venue?.name ?? "No venue"), showHost && slot.ta.name].filter(Boolean).join(" · ");

  if (slot.bookings.length === 0) {
    // Open slots are quiet: one muted line, no actions.
    return (
      <li id={phase === "now" ? "now" : undefined} className="flex items-center gap-3 px-3 py-1.5 text-xs text-muted-foreground sm:px-4">
        <span className="w-28 shrink-0 tabular-nums sm:w-32">{time}</span>
        <span className="rounded border border-dashed px-1.5 py-0.5">Open · not booked</span>
        {extra && <span className="truncate">{extra}</span>}
      </li>
    );
  }

  const started = phase === "done" || phase === "now";
  return (
    <>
      {slot.bookings.map((b) => {
        const status = demoStatus(b, phase);
        return (
          <li
            key={b.id}
            id={phase === "now" ? "now" : undefined}
            className={cn(
              "relative flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 pr-3 pl-4 before:absolute before:inset-y-0 before:left-0 before:w-1 sm:pr-4 sm:pl-5",
              TONE[status.tone].stripe,
              phase === "now" && "bg-primary/5",
            )}
          >
            <span className={cn("w-24 shrink-0 text-sm tabular-nums sm:w-28", phase === "now" && "font-semibold")}>{time}</span>
            {/* A minimum width so on a phone the status wraps below rather than squeezing the name. */}
            <span className="min-w-36 flex-1">
              <span className="block truncate font-medium">{b.student.name}</span>
              {extra && <span className="block truncate text-xs text-muted-foreground">{extra}</span>}
            </span>
            <Pill tone={status.tone}>{status.label}</Pill>
            <BookingActions booking={b} slot={slot} ctx={ctx} started={started} />
          </li>
        );
      })}
    </>
  );
}

/**
 * Attendance and marking for one student. Attendance only appears once the demo
 * has started (it can't be recorded earlier), so there are no dead buttons.
 */
function BookingActions({ booking: b, slot, ctx, started, prominent }: { booking: Booking; slot: DemoDaySlot; ctx: RowContext; started: boolean; prominent?: boolean }) {
  const href = markHref(slot.assignment, { day: ctx.day, bookingId: b.id, everyone: ctx.everyone, back: ctx.back });
  const locked = b.evaluation?.status === "SUBMITTED" || b.evaluation?.status === "FINALIZED";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {started && !locked && b.status === "BOOKED" && (
        <>
          <ActionForm action={markAttendanceAction} compact>
            <input type="hidden" name="bookingId" value={b.id} />
            <input type="hidden" name="status" value="COMPLETED" />
            <input type="hidden" name="next" value={href} />
            <SubmitButton size="sm" variant={prominent ? "default" : "outline"}>
              Present → mark
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
            <SubmitButton size="sm" variant="ghost">
              No-show
            </SubmitButton>
          </ActionForm>
        </>
      )}
      {!locked && b.status === "NO_SHOW" && (
        <ActionForm action={markAttendanceAction} compact>
          <input type="hidden" name="bookingId" value={b.id} />
          <input type="hidden" name="status" value="BOOKED" />
          <SubmitButton size="sm" variant="ghost" aria-label={`Undo no-show for ${b.student.name}`}>
            Undo
          </SubmitButton>
        </ActionForm>
      )}
      {b.status === "COMPLETED" && (
        <Button asChild size="sm" variant={locked ? "ghost" : "outline"}>
          <Link href={href}>{locked ? "View" : "Mark"}</Link>
        </Button>
      )}
    </div>
  );
}

// ─── Week, loose ends ────────────────────────────────────────────────────────

function WeekStrip({ data, href }: { data: DemoDay; href: (day: string) => string }) {
  const used = new Set(data.week.map((d) => d.state).filter((s) => s !== "none"));
  return (
    <div className="space-y-1.5">
      <nav aria-label="Week" className="flex items-stretch gap-1">
        <Button asChild variant="ghost" size="icon-sm" aria-label="Previous week" className="h-auto self-stretch">
          <Link href={href(data.prevWeek)}>
            <ChevronsLeft />
          </Link>
        </Button>
        <div className="grid min-w-0 flex-1 grid-cols-7 gap-1">
          {data.week.map((d) => {
            const state = d.state === "none" ? null : DAY_STATE[d.state];
            const selected = d.day === data.day;
            return (
              <Link
                key={d.day}
                href={href(d.day)}
                aria-current={selected ? "date" : undefined}
                aria-label={`${d.label} ${d.date}: ${d.count ? `${d.count} demo${d.count === 1 ? "" : "s"}, ${state?.label.toLowerCase()}` : "no demos"}`}
                className={cn(
                  "flex min-w-0 flex-col items-center rounded-lg border px-1 py-1.5 text-xs transition-colors",
                  state ? TONE[state.tone].pill : "text-muted-foreground hover:bg-muted/60",
                  state && "border-transparent",
                  selected && "ring-2 ring-foreground ring-offset-1 ring-offset-background",
                )}
              >
                <span className="font-medium">{d.label}</span>
                <span className="hidden opacity-80 sm:inline">{d.date}</span>
                <span className="mt-0.5 text-sm font-semibold tabular-nums">{d.count || "·"}</span>
              </Link>
            );
          })}
        </div>
        <Button asChild variant="ghost" size="icon-sm" aria-label="Next week" className="h-auto self-stretch">
          <Link href={href(data.nextWeek)}>
            <ChevronsRight />
          </Link>
        </Button>
      </nav>
      {used.size > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 px-9 text-xs text-muted-foreground" aria-label="Legend">
          {(Object.keys(DAY_STATE) as (keyof typeof DAY_STATE)[])
            .filter((s) => used.has(s))
            .map((s) => (
              <li key={s} className="flex items-center gap-1.5">
                <span className={cn("size-2 rounded-full", TONE[DAY_STATE[s].tone].dot)} aria-hidden /> {DAY_STATE[s].label}
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

function NextDemoHint({ data, dayHref }: { data: DemoDay; dayHref: (day: string) => string }) {
  if (!data.nextDemoAt) return <>Nothing booked after this day yet.</>;
  return (
    <>
      Next demos:{" "}
      <Link className="underline" href={dayHref(fmt(data.nextDemoAt, data.timezone, "yyyy-MM-dd", "24h"))}>
        {fmt(data.nextDemoAt, data.timezone, "EEEE d MMMM 'from' HH:mm")}
      </Link>
    </>
  );
}

function LooseEnds({ data, dayHref, back }: { data: DemoDay; dayHref: (day: string) => string; back: string }) {
  const { attendance, marking, openRequests } = data.toFinish;
  const pastAttendance = attendance.filter((a) => a.day !== data.day);
  if (pastAttendance.length === 0 && marking.length === 0 && openRequests.length === 0) return null;
  // Marking is grouped per assignment: each group opens the marking sheet on its to-do list.
  const byAssignment = new Map<string, typeof marking>();
  for (const b of marking) byAssignment.set(b.assignment.id, [...(byAssignment.get(b.assignment.id) ?? []), b]);
  return (
    <section aria-labelledby="loose-ends" className="space-y-2">
      <h3 id="loose-ends" className="text-sm font-semibold">
        Still to finish
      </h3>
      <ul className="divide-y rounded-xl border bg-card text-sm">
        {pastAttendance.length > 0 && (
          <li className="flex flex-wrap items-center gap-2 px-4 py-2.5">
            <Pill tone="danger">Attendance missing</Pill>
            {pastAttendance.map((a) => (
              <Link key={a.day} className="underline" href={dayHref(a.day)}>
                {a.label} ({a.count})
              </Link>
            ))}
          </li>
        )}
        {[...byAssignment.values()].map((group) => {
          const a = group[0].assignment;
          return (
            <li key={a.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
              <Pill tone="warning">To mark</Pill>
              <span className="min-w-0 flex-1 truncate">
                {group.length} demo{group.length === 1 ? "" : "s"} · {a.course.code} {a.title}
              </span>
              <Button asChild size="sm" variant="outline">
                <Link href={`${markHref(a, { back })}&todo=1`}>Open marking sheet</Link>
              </Button>
            </li>
          );
        })}
        {openRequests.length > 0 && (
          <li className="flex flex-wrap items-center gap-2 px-4 py-2.5">
            <Pill tone="warning">Student requests</Pill>
            {openRequests.map((r) => (
              <Link key={r.courseId} className="underline" href={`/courses/${r.courseId}/manage/requests`}>
                {r.code} ({r.count})
              </Link>
            ))}
          </li>
        )}
      </ul>
    </section>
  );
}
