import Link from "next/link";
import { CalendarRange, Clock, PenLine, Repeat, Settings2, Target } from "lucide-react";
import { closeAssignmentAction, publishAssignmentAction } from "@/app/actions/scheduling";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { markHref } from "@/components/demo-day";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { currentClock, dayRange, fmt, fmtData, fmtTimeRange, tzLabel } from "@/lib/time";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth/session";
import { load } from "@/server/page-utils";
import { getAssignment } from "@/server/services/assignments";
import { listCourseStaff, listVenues } from "@/server/services/courses";
import { listAssignmentRoster } from "@/server/services/evaluations";
import { listHostBusy, listSlotsForStaff } from "@/server/services/slots";
import { waitlistCount } from "@/server/services/waitlist";
import { AvailabilityPlanner } from "./availability-planner";
import { SlotTable, type SlotRow } from "./slot-table";
import { StudentsTable, type StudentRow } from "./students-table";

const STATE = {
  DRAFT: { label: "Not open yet", className: "bg-muted text-muted-foreground" },
  PUBLISHED: { label: "Booking open", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" },
  CLOSED: { label: "Booking closed", className: "bg-muted text-muted-foreground" },
} as const;

export default async function ManageAssignmentPage({ params, searchParams }: PageProps<"/courses/[courseId]/manage/assignments/[assignmentId]">) {
  const { courseId, assignmentId } = await params;
  const { tab, filter } = await searchParams;
  const user = await requireUser();
  const { assignment, criteria, role } = await load(getAssignment(user, assignmentId));
  const tz = assignment.course.timezone;
  const policy = assignment.policy!;
  const [slots, venues, staff, roster, waiting, busy] = await Promise.all([
    listSlotsForStaff(user, assignmentId),
    listVenues(user, courseId),
    listCourseStaff(courseId),
    listAssignmentRoster(user, assignmentId),
    waitlistCount(user, assignmentId),
    listHostBusy(user, assignmentId),
  ]);
  const activeTab = tab === "students" ? "students" : "slots";
  const now = new Date();
  const base = `/courses/${courseId}/manage/assignments/${assignmentId}`;
  const liveSlots = slots.filter((s) => s.status !== "CANCELLED");
  const hiddenSlots = slots.filter((s) => s.status === "DRAFT").length;
  const capacity = liveSlots.filter((s) => s.endsAt > now).reduce((n, s) => n + s.capacity, 0);
  const booked = roster.filter((r) => r.booking).length;
  const hasBookings = booked > 0;
  const state = STATE[assignment.status];
  const instructor = role === "INSTRUCTOR";

  // Every day of the demo window, for the slot planner.
  const days: { key: string; weekday: string; date: string; past: boolean }[] = [];
  for (let key = fmtData(policy.windowStart, tz, "yyyy-MM-dd"); days.length < 62; ) {
    const { start, end } = dayRange(key, tz);
    if (start >= policy.windowEnd) break;
    days.push({ key, weekday: fmt(start, tz, "EEE"), date: fmt(start, tz, "d MMM"), past: end <= now });
    key = fmtData(end, tz, "yyyy-MM-dd");
  }

  const slotRows: SlotRow[] = slots.map((s) => ({
    id: s.id,
    dayKey: fmtData(s.startsAt, tz, "yyyy-MM-dd"),
    day: fmt(s.startsAt, tz, "EEEE d MMMM"),
    time: fmtTimeRange(s.startsAt, s.endsAt, tz),
    host: s.ta.name,
    venue: s.venue?.name ?? null,
    status: s.status,
    capacity: s.capacity,
    past: s.endsAt < now,
    bookings: s.bookings.map((b) => ({ id: b.id, name: b.student.name, status: b.status })),
  }));
  const studentRows: StudentRow[] = roster.map((r) => ({
    id: r.student.id,
    name: r.student.name,
    email: r.student.email,
    section: r.section,
    slot: r.booking ? fmt(r.booking.slot.startsAt, tz, "EEE d MMM, HH:mm") : null,
    host: r.booking?.slot.ta.name ?? null,
    bookingId: r.booking?.id ?? null,
    bookingStatus: r.booking?.status ?? null,
    evaluationId: r.evaluation?.id ?? null,
    evaluationStatus: r.evaluation?.status ?? null,
    noBooking: Boolean(r.evaluation?.noBookingReason),
    total: r.evaluation?.totalMarks ?? null,
  }));

  const facts = [
    { icon: CalendarRange, label: "Demos", value: `${fmt(policy.windowStart, tz, "EEE d MMM")} – ${fmt(policy.windowEnd, tz, "EEE d MMM")}` },
    {
      icon: Clock,
      label: "Each slot",
      value: `${policy.slotDurationMin} min${policy.bufferMin ? ` + ${policy.bufferMin} min break` : ""} · ${policy.capacityPerSlot === 1 ? "1 student" : `${policy.capacityPerSlot} students`}`,
    },
    {
      icon: Repeat,
      label: "Students can change",
      value: policy.maxReschedules === 0 ? "No changes" : `${policy.maxReschedules}×, until ${policy.freezeHours} h before`,
    },
    { icon: Target, label: "Marked out of", value: `${assignment.maxMarks}${criteria.length ? ` · ${criteria.length} criteria` : ""}` },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {assignment.title}
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", state.className)}>{state.label}</span>
          </span>
        }
        back={{ href: `/courses/${courseId}/manage`, label: "Assignments" }}
        actions={
          hasBookings && (
            <Button asChild>
              <Link href={markHref({ id: assignmentId, courseId }, { day: fmtData(now, tz, "yyyy-MM-dd") })}>
                <PenLine /> Marking sheet
              </Link>
            </Button>
          )
        }
      />

      <div className="grid gap-3 lg:grid-cols-[1fr_340px]">
        <Card className="gap-0 py-0">
          <dl className="grid grid-cols-2 divide-x divide-y sm:grid-cols-4 sm:divide-y-0">
            {facts.map((f) => (
              <div key={f.label} className="p-3">
                <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <f.icon className="size-3.5" aria-hidden /> {f.label}
                </dt>
                <dd className="mt-0.5 text-sm font-medium">{f.value}</dd>
              </div>
            ))}
          </dl>
          <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
            <span>Times are {tzLabel(tz)}</span>
            <Link href={`${base}/edit`} className="inline-flex items-center gap-1 font-medium text-foreground hover:underline">
              <Settings2 className="size-3.5" /> Edit settings
            </Link>
          </div>
        </Card>

        <BookingPanel
          assignmentId={assignmentId}
          status={assignment.status}
          slots={liveSlots.length}
          hiddenSlots={hiddenSlots}
          capacity={capacity}
          students={roster.length}
          booked={booked}
          waiting={waiting}
          opensAt={policy.bookingOpensAt && policy.bookingOpensAt > now ? fmt(policy.bookingOpensAt, tz, "EEE d MMM 'at' HH:mm") : null}
        />
      </div>

      <nav className="flex gap-1 border-b text-sm" aria-label="Assignment sections">
        {[
          ["slots", `Slots (${liveSlots.length})`],
          ["students", `Students & marks (${roster.length})`],
        ].map(([key, label]) => (
          <Link
            key={key}
            href={`${base}?tab=${key}`}
            aria-current={activeTab === key ? "page" : undefined}
            className={cn("px-3 py-2", activeTab === key ? "font-medium shadow-[inset_0_-2px_0_0_var(--color-primary)]" : "text-muted-foreground hover:text-foreground")}
          >
            {label}
          </Link>
        ))}
      </nav>

      {activeTab === "slots" ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="order-2 min-w-0 lg:order-1">
            {slots.length === 0 ? (
              <EmptyState title="No slots yet">Pick the days and hours you&apos;re available on the right. Slotty splits them into {policy.slotDurationMin}-minute slots.</EmptyState>
            ) : (
              <SlotTable
                slots={slotRows}
                venues={venues.map((v) => ({ id: v.id, name: v.name }))}
                hosts={instructor ? staff.map((s) => ({ id: s.userId, name: s.user.name })) : []}
              />
            )}
          </div>
          <Card className="order-1 h-fit lg:order-2">
            <CardHeader>
              <CardTitle>
                <h2>Add slots</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {assignment.status === "CLOSED" ? (
                <p className="text-sm text-muted-foreground">Booking is closed. Reopen it to add slots.</p>
              ) : (
                <AvailabilityPlanner
                  courseId={courseId}
                  assignmentId={assignmentId}
                  timezone={tz}
                  timezoneLabel={tzLabel(tz)}
                  clock={currentClock()}
                  policy={{ windowStart: policy.windowStart.toISOString(), windowEnd: policy.windowEnd.toISOString(), slotDurationMin: policy.slotDurationMin, bufferMin: policy.bufferMin }}
                  days={days}
                  hosts={instructor ? staff.map((s) => ({ id: s.userId, name: s.user.name })) : [{ id: user.id, name: user.name }]}
                  me={user.id}
                  venues={venues.map((v) => ({ id: v.id, name: v.name }))}
                  busy={busy.map((b) => ({ taId: b.taId, startsAt: b.startsAt.toISOString(), endsAt: b.endsAt.toISOString() }))}
                  open={assignment.status === "PUBLISHED"}
                />
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <StudentsTable
          rows={studentRows}
          maxMarks={assignment.maxMarks}
          detailsHref={`${base}/evaluate`}
          markBase={`${base}/mark`}
          exportHref={`${base}/export`}
          initialFilter={typeof filter === "string" ? filter : undefined}
        />
      )}
    </div>
  );
}

/**
 * Where booking stands and the one thing to do next: open it (once there are
 * slots to book), close it, or reopen it.
 */
function BookingPanel(p: {
  assignmentId: string;
  status: "DRAFT" | "PUBLISHED" | "CLOSED";
  slots: number;
  hiddenSlots: number;
  capacity: number;
  students: number;
  booked: number;
  waiting: number;
  opensAt: string | null;
}) {
  const short = p.status !== "CLOSED" && p.capacity < p.students - p.booked;
  return (
    <Card className="gap-2 p-4 text-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Booking</p>
      {p.status === "DRAFT" && (
        <>
          <p>
            {p.slots === 0
              ? "Students can't see this assignment yet. Add slots first: opening booking notifies every student, so there must be times to pick."
              : `${p.slots} slot${p.slots === 1 ? " is" : "s are"} ready but hidden. Opening booking shows them and notifies all ${p.students} students${p.opensAt ? ` that booking starts ${p.opensAt}` : ""}.`}
          </p>
          <ActionForm
            action={publishAssignmentAction}
            compact
            confirmLabel="Open booking"
            confirm={`Open booking? All ${p.students} students are notified${p.opensAt ? ` that they can book from ${p.opensAt}` : " and can book straight away"}.`}
          >
            <input type="hidden" name="assignmentId" value={p.assignmentId} />
            <SubmitButton className="w-full" disabled={p.slots === 0}>
              Open booking
            </SubmitButton>
          </ActionForm>
        </>
      )}
      {p.status === "PUBLISHED" && (
        <>
          <p>
            <span className="font-semibold tabular-nums">{p.booked}</span> of {p.students} students booked
            {p.waiting > 0 && ` · ${p.waiting} waiting for a free slot`}.
            {p.opensAt && ` Students can book from ${p.opensAt}.`}
          </p>
          {short && <p className="text-amber-700 dark:text-amber-400">Only {p.capacity} free places left for {p.students - p.booked} unbooked students — add slots.</p>}
          <ActionForm
            action={closeAssignmentAction}
            compact
            confirmLabel="Close booking"
            confirm="Close booking? Students can no longer book or change their slot. Existing bookings, demos and marking carry on."
          >
            <input type="hidden" name="assignmentId" value={p.assignmentId} />
            <SubmitButton variant="outline" className="w-full">
              Close booking
            </SubmitButton>
          </ActionForm>
        </>
      )}
      {p.status === "CLOSED" && (
        <>
          <p>
            Closed with {p.booked} of {p.students} students booked. Demos and marking carry on; nobody can book or change.
          </p>
          <ActionForm action={publishAssignmentAction} compact confirmLabel="Reopen booking" confirm="Reopen booking? Students who haven't booked are notified.">
            <input type="hidden" name="assignmentId" value={p.assignmentId} />
            <SubmitButton variant="outline" className="w-full">
              Reopen booking
            </SubmitButton>
          </ActionForm>
        </>
      )}
    </Card>
  );
}
