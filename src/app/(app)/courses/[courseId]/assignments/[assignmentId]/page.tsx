import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock, CalendarPlus, ExternalLink, MapPin, User } from "lucide-react";
import { bookSlotAction, cancelBookingAction, joinWaitlistAction, leaveWaitlistAction, rescheduleAction } from "@/app/actions/bookings";
import { LocalTimeHint } from "@/components/local-time-hint";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { EmptyState, PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { canBookSlot, canCancelBooking, cancelConsequence, rescheduleConsequence, changeBudget, freezeAt, isFrozen, NO_ALLOWANCE } from "@/domain/booking-rules";
import { fmt, fmtRange } from "@/lib/time";
import { requireUser } from "@/server/auth/session";
import { load } from "@/server/page-utils";
import { getAssignment } from "@/server/services/assignments";
import { getMyChangeState, listMyBookings } from "@/server/services/bookings";
import { getMyResult } from "@/server/services/evaluations";
import { listMyRequests } from "@/server/services/requests";
import { listOpenSlots } from "@/server/services/slots";
import { isOnWaitlist } from "@/server/services/waitlist";
import { RequestPanel } from "./request-panel";

export default async function StudentAssignmentPage({ params, searchParams }: PageProps<"/courses/[courseId]/assignments/[assignmentId]">) {
  const { courseId, assignmentId } = await params;
  const { reschedule, day: dayFilter, host: hostFilter } = await searchParams;
  const user = await requireUser();
  const { assignment, role } = await load(getAssignment(user, assignmentId));
  if (role !== "STUDENT") redirect(`/courses/${courseId}/manage/assignments/${assignmentId}`);

  const tz = assignment.course.timezone;
  const policy = assignment.policy!;
  const now = new Date();
  const [slots, history, result, changeState, requests, waiting] = await Promise.all([
    listOpenSlots(user, assignmentId),
    listMyBookings(user, { assignmentId }),
    getMyResult(user, assignmentId),
    getMyChangeState(user, assignmentId),
    listMyRequests(user, assignmentId),
    isOnWaitlist(user, assignmentId),
  ]);
  const { budget, allowance } = changeState ?? {
    allowance: NO_ALLOWANCE,
    budget: changeBudget({ maxReschedules: policy.maxReschedules, selfCancellations: 0 }),
  };
  const open = assignment.status === "PUBLISHED" || (assignment.status === "CLOSED" && allowance.lateBooking);
  const booking = history.find((b) => b.status !== "CANCELLED");
  const rescheduling = Boolean(reschedule && booking?.status === "BOOKED");
  const bookingState = booking && { status: booking.status, slotStartsAt: booking.slot.startsAt };
  const cancelRule = bookingState ? canCancelBooking({ now, assignmentStatus: assignment.status, policy, booking: bookingState, allowance }) : null;
  const canMove = booking?.status === "BOOKED" && open && budget.left > 0 && !isFrozen(booking.slot.startsAt, now, policy.freezeHours);
  const locksAt = booking && policy.freezeHours > 0 ? freezeAt(booking.slot.startsAt, policy.freezeHours) : null;
  // After cancelling more times than allowed, only staff can place the student.
  const outOfChanges = !booking && budget.used > budget.allowed;

  // Group bookable slots by day in the course timezone, with optional day/host filters.
  const bookable = slots.filter((s) => s.id !== booking?.slotId && s.seatsLeft > 0);
  const fullSlots = slots.filter((s) => s.id !== booking?.slotId && s.seatsLeft === 0).length;
  const dayKey = (d: Date) => fmt(d, tz, "yyyy-MM-dd");
  const dayOptions = [...new Map(bookable.map((s) => [dayKey(s.startsAt), fmt(s.startsAt, tz, "EEE d MMM")])).entries()];
  const hostOptions = [...new Map(bookable.map((s) => [s.ta.id, s.ta.name])).entries()];
  const pickDay = typeof dayFilter === "string" && dayOptions.some(([k]) => k === dayFilter) ? dayFilter : null;
  const pickHost = typeof hostFilter === "string" && hostOptions.some(([k]) => k === hostFilter) ? hostFilter : null;
  const days = new Map<string, typeof slots>();
  for (const s of bookable) {
    if ((pickDay && dayKey(s.startsAt) !== pickDay) || (pickHost && s.ta.id !== pickHost)) continue;
    const key = fmt(s.startsAt, tz, "EEEE d MMMM");
    days.set(key, [...(days.get(key) ?? []), s]);
  }
  const filterHref = (next: { day?: string | null; host?: string | null }) => {
    const q = new URLSearchParams();
    if (rescheduling) q.set("reschedule", "1");
    const d = next.day === undefined ? pickDay : next.day;
    const h = next.host === undefined ? pickHost : next.host;
    if (d) q.set("day", d);
    if (h) q.set("host", h);
    return `?${q}`;
  };

  const showPicker = !booking || rescheduling;
  const bookingOpensLater = Boolean(policy.bookingOpensAt && policy.bookingOpensAt > now && !allowance.lateBooking);
  const noSlotsToBook = open && !outOfChanges && !bookingOpensLater && bookable.length === 0;
  // Stuck = there's no self-service way forward, so offer the staff request up front.
  const frozen = booking?.status === "BOOKED" && isFrozen(booking.slot.startsAt, now, policy.freezeHours);
  const stuck = (!booking && (!open || outOfChanges || noSlotsToBook)) || (booking?.status === "BOOKED" && (frozen || (!canMove && !cancelRule?.ok)));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={assignment.title}
        description={`${assignment.course.code} · ${assignment.course.title}`}
        back={{ href: `/courses/${courseId}`, label: assignment.course.code }}
      />

      {assignment.description && <p className="whitespace-pre-line text-sm">{assignment.description}</p>}
      <LocalTimeHint timezone={tz} />

      {result && (
        <Card className="border-emerald-300 dark:border-emerald-900">
          <CardHeader>
            <CardDescription>Your result</CardDescription>
            <CardTitle className="text-3xl">
              {result.totalMarks} <span className="text-base font-normal text-muted-foreground">/ {result.maxMarks}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {result.scores.length > 0 && (
              <ul className="divide-y rounded-lg border">
                {result.scores.map((s) => (
                  <li key={s.label} className="flex justify-between gap-3 p-2.5">
                    <div>
                      <p>{s.label}</p>
                      {s.comment && <p className="text-muted-foreground">{s.comment}</p>}
                    </div>
                    <span className="font-medium tabular-nums">
                      {s.points}/{s.maxPoints}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {result.feedback && (
              <div>
                <p className="font-medium">Feedback</p>
                <p className="whitespace-pre-line text-muted-foreground">{result.feedback}</p>
              </div>
            )}
            <RequestPanel
              assignmentId={assignmentId}
              kind="MARK_QUERY"
              requests={requests}
              timezone={tz}
              now={now}
              title="Question about your marks?"
              hint="Explain which part you'd like looked at again. Course staff will reply here and by email."
            />
          </CardContent>
        </Card>
      )}

      {booking && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardDescription>Your demo</CardDescription>
              <StatusBadge status={booking.status} />
            </div>
            <CardTitle className="text-xl">{fmt(booking.slot.startsAt, tz, "EEEE d MMMM")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="flex items-center gap-2">
              <CalendarClock className="size-4 text-muted-foreground" />
              {fmt(booking.slot.startsAt, tz, "HH:mm")}–{fmt(booking.slot.endsAt, tz, "HH:mm")} <span className="text-muted-foreground">({tz})</span>
            </p>
            <p className="flex items-center gap-2">
              <MapPin className="size-4 text-muted-foreground" />
              {booking.slot.venue ? [booking.slot.venue.name, booking.slot.venue.location].filter(Boolean).join(", ") : "Venue to be announced"}
            </p>
            {booking.slot.venue?.meetingUrl && (
              <a href={booking.slot.venue.meetingUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-primary underline">
                <ExternalLink className="size-4" /> Join online meeting
              </a>
            )}
            <p className="flex items-center gap-2">
              <User className="size-4 text-muted-foreground" /> {booking.slot.ta.name}
            </p>
            {booking.status === "BOOKED" && (
              <a href={`/bookings/${booking.id}/calendar`} className="flex items-center gap-2 text-primary underline">
                <CalendarPlus className="size-4" /> Add to calendar
              </a>
            )}
            {booking.status === "BOOKED" && (
              <div className="flex flex-wrap items-center gap-2 pt-3">
                {rescheduling ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href="?">Keep this slot</Link>
                  </Button>
                ) : canMove ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href="?reschedule=1">Reschedule</Link>
                  </Button>
                ) : null}
                {cancelRule?.ok && (
                  <ActionForm action={cancelBookingAction} compact confirm={`Cancel this booking? ${cancelConsequence(budget)}`} confirmLabel="Cancel booking">
                    <input type="hidden" name="bookingId" value={booking.id} />
                    <SubmitButton variant="destructive" size="sm">
                      Cancel booking
                    </SubmitButton>
                  </ActionForm>
                )}
                <p className="w-full text-xs text-muted-foreground">
                  {cancelRule && !cancelRule.ok ? cancelRule.reason + " " : ""}
                  {budget.allowed > 0 && `${budget.left} of ${budget.allowed} change${budget.allowed === 1 ? "" : "s"} left (reschedules and cancellations both count). `}
                  {locksAt && locksAt > now && `Changes lock ${fmt(locksAt, tz, "EEE d MMM, HH:mm")}.`}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {showPicker && (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">{rescheduling ? "Pick a new slot" : "Book a slot"}</h2>
            <p className="text-sm text-muted-foreground">
              {policy.slotDurationMin}-minute demos · times in {tz}
              {policy.freezeHours > 0 && ` · changes lock ${policy.freezeHours}h before your slot`}
              {fullSlots > 0 && ` · ${fullSlots} full slot${fullSlots === 1 ? "" : "s"} hidden`}
            </p>
          </div>
          {(dayOptions.length > 1 || hostOptions.length > 1) && (
            <nav aria-label="Filter slots" className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
              {dayOptions.length > 1 && (
                <FilterChips label="Day" current={pickDay} options={dayOptions} href={(v) => filterHref({ day: v })} />
              )}
              {hostOptions.length > 1 && (
                <FilterChips label="With" current={pickHost} options={hostOptions} href={(v) => filterHref({ host: v })} />
              )}
            </nav>
          )}
          {!open ? (
            <Alert>
              <AlertDescription>Booking is closed for this assignment. Send a request below if you still need a slot.</AlertDescription>
            </Alert>
          ) : outOfChanges ? (
            <Alert>
              <AlertDescription>
                You&apos;ve used all {budget.allowed} change{budget.allowed === 1 ? "" : "s"} for this assignment, so you can&apos;t book again yourself. Send a
                request below and your TA can place you in a slot.
              </AlertDescription>
            </Alert>
          ) : bookingOpensLater ? (
            <Alert>
              <AlertDescription>Booking opens {fmt(policy.bookingOpensAt!, tz, "EEEE d MMMM 'at' HH:mm")}. We&apos;ll notify you when it opens.</AlertDescription>
            </Alert>
          ) : noSlotsToBook ? (
            <EmptyState title={fullSlots > 0 ? "All slots are taken right now" : "No slots available right now"}>
              {waiting ? (
                <ActionForm action={leaveWaitlistAction} compact className="mt-2 space-y-2">
                  <p>You&apos;re on the list — we&apos;ll notify you as soon as a slot frees up.</p>
                  <input type="hidden" name="assignmentId" value={assignmentId} />
                  <SubmitButton size="sm" variant="ghost">
                    Stop alerts
                  </SubmitButton>
                </ActionForm>
              ) : (
                <ActionForm action={joinWaitlistAction} compact className="mt-2 space-y-2">
                  <p>Slots free up when others cancel, and your TA may add more times.</p>
                  <input type="hidden" name="assignmentId" value={assignmentId} />
                  <SubmitButton size="sm">Notify me when a slot frees up</SubmitButton>
                </ActionForm>
              )}
            </EmptyState>
          ) : days.size === 0 ? (
            <EmptyState title="No slots match these filters">
              <Link className="underline" href={filterHref({ day: null, host: null })}>
                Show all slots
              </Link>
            </EmptyState>
          ) : (
            [...days.entries()].map(([day, daySlots]) => (
              <div key={day} className="space-y-2">
                <h3 className="text-sm font-medium">{day}</h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {daySlots.map((s) => {
                    const rule = canBookSlot({
                      now,
                      assignmentStatus: assignment.status,
                      policy,
                      slot: { startsAt: s.startsAt, status: s.status, capacity: s.capacity, activeBookings: s.booked },
                      allowance,
                    });
                    return (
                      <ActionForm
                        key={s.id}
                        action={rescheduling ? rescheduleAction : bookSlotAction}
                        compact
                        confirm={rescheduling ? `Move your demo to ${fmtRange(s.startsAt, s.endsAt, tz)}? ${rescheduleConsequence(budget)}` : undefined}
                        confirmLabel="Move my demo"
                      >
                        <input type="hidden" name="slotId" value={s.id} />
                        {booking && <input type="hidden" name="bookingId" value={booking.id} />}
                        <input type="hidden" name="returnTo" value={`/courses/${courseId}/assignments/${assignmentId}`} />
                        <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
                          <div className="min-w-0 flex-1 text-sm">
                            <p className="font-medium tabular-nums">
                              {fmt(s.startsAt, tz, "HH:mm")}–{fmt(s.endsAt, tz, "HH:mm")}
                            </p>
                            <p className="truncate text-muted-foreground">
                              {s.venue?.name ?? "Venue TBA"} · {s.ta.name}
                            </p>
                            {s.capacity > 1 && <p className="text-xs text-muted-foreground">{s.seatsLeft} of {s.capacity} places left</p>}
                            {!rule.ok && <p className="text-xs text-muted-foreground">{rule.reason}</p>}
                          </div>
                          <SubmitButton size="sm" disabled={!rule.ok}>
                            {rescheduling ? "Move here" : "Book"}
                          </SubmitButton>
                        </div>
                      </ActionForm>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </section>
      )}

      {booking?.status !== "COMPLETED" && (
        <RequestPanel
          assignmentId={assignmentId}
          kind="BOOKING_CHANGE"
          requests={requests}
          timezone={tz}
          now={now}
          open={stuck}
          title={stuck ? "Need a different time? Ask course staff" : "Need help with your booking?"}
          hint={
            frozen
              ? "Your slot is locked, so only staff can change it. Say what happened and which times would work."
              : "Explain what you need, e.g. times that would work for you. Staff can move you without using your changes."
          }
        />
      )}

      {history.filter((b) => b.status === "CANCELLED").length > 0 && (
        <details className="text-sm text-muted-foreground">
          <summary className="cursor-pointer">Booking history</summary>
          <ul className="mt-2 space-y-1">
            {history
              .filter((b) => b.status === "CANCELLED")
              .map((b) => (
                <li key={b.id}>
                  {fmtRange(b.slot.startsAt, b.slot.endsAt, tz)} — cancelled {b.cancelledAt && fmt(b.cancelledAt, tz, "d MMM HH:mm")}
                  {b.cancelledById === user.id ? " by you (used a change)" : " by staff"}
                </li>
              ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function FilterChips({
  label,
  current,
  options,
  href,
}: {
  label: string;
  current: string | null;
  options: [string, string][];
  href: (value: string | null) => string;
}) {
  const chip = (value: string | null, text: string) => (
    <Link
      key={value ?? "all"}
      href={href(value)}
      aria-current={current === value ? "true" : undefined}
      className={`rounded-full border px-2.5 py-0.5 ${current === value ? "border-primary bg-primary/10 font-medium" : "text-muted-foreground hover:text-foreground"}`}
    >
      {text}
    </Link>
  );
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-muted-foreground">{label}:</span>
      {chip(null, "Any")}
      {options.map(([value, text]) => chip(value, text))}
    </div>
  );
}
