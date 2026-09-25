import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock, ExternalLink, MapPin, User } from "lucide-react";
import { bookSlotAction, cancelBookingAction, rescheduleAction } from "@/app/actions/bookings";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { EmptyState, PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { canBookSlot, canCancelBooking, isFrozen } from "@/domain/booking-rules";
import { fmt, fmtRange } from "@/lib/time";
import { requireUser } from "@/server/auth/session";
import { load } from "@/server/page-utils";
import { getAssignment } from "@/server/services/assignments";
import { listMyBookings } from "@/server/services/bookings";
import { getMyResult } from "@/server/services/evaluations";
import { listOpenSlots } from "@/server/services/slots";

export default async function StudentAssignmentPage({ params, searchParams }: PageProps<"/courses/[courseId]/assignments/[assignmentId]">) {
  const { courseId, assignmentId } = await params;
  const { reschedule } = await searchParams;
  const user = await requireUser();
  const { assignment, role } = await load(getAssignment(user, assignmentId));
  if (role !== "STUDENT") redirect(`/courses/${courseId}/manage/assignments/${assignmentId}`);

  const tz = assignment.course.timezone;
  const policy = assignment.policy!;
  const now = new Date();
  const [slots, history, result] = await Promise.all([
    listOpenSlots(user, assignmentId),
    listMyBookings(user, { assignmentId }),
    getMyResult(user, assignmentId),
  ]);
  const booking = history.find((b) => b.status !== "CANCELLED");
  const rescheduling = Boolean(reschedule && booking?.status === "BOOKED");
  const bookingState = booking && { status: booking.status, rescheduleCount: booking.rescheduleCount, slotStartsAt: booking.slot.startsAt };
  const cancelRule = bookingState ? canCancelBooking({ now, policy, booking: bookingState }) : null;
  const reschedulesLeft = booking ? Math.max(0, policy.maxReschedules - booking.rescheduleCount) : policy.maxReschedules;
  const canMove =
    booking?.status === "BOOKED" &&
    assignment.status === "PUBLISHED" &&
    reschedulesLeft > 0 &&
    !isFrozen(booking.slot.startsAt, now, policy.freezeHours);

  // Group bookable slots by day in the course timezone.
  const days = new Map<string, typeof slots>();
  let fullSlots = 0;
  for (const s of slots) {
    if (s.id === booking?.slotId) continue;
    if (s.seatsLeft === 0) {
      fullSlots++;
      continue;
    }
    const key = fmt(s.startsAt, tz, "EEEE d MMMM");
    days.set(key, [...(days.get(key) ?? []), s]);
  }

  const showPicker = !booking || rescheduling;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={assignment.title}
        description={`${assignment.course.code} · ${assignment.course.title}`}
        back={{ href: `/courses/${courseId}`, label: assignment.course.code }}
      />

      {assignment.description && <p className="whitespace-pre-line text-sm">{assignment.description}</p>}

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
                  <ActionForm action={cancelBookingAction} compact confirm="Cancel this booking? You'll need to book another slot.">
                    <input type="hidden" name="bookingId" value={booking.id} />
                    <SubmitButton variant="destructive" size="sm">
                      Cancel booking
                    </SubmitButton>
                  </ActionForm>
                )}
                <p className="w-full text-xs text-muted-foreground">
                  {cancelRule && !cancelRule.ok ? cancelRule.reason + " " : ""}
                  {policy.maxReschedules > 0 && `${reschedulesLeft} of ${policy.maxReschedules} reschedules left.`}
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
          {assignment.status === "CLOSED" ? (
            <Alert>
              <AlertDescription>Booking is closed for this assignment. Contact your TA if you still need a slot.</AlertDescription>
            </Alert>
          ) : policy.bookingOpensAt && policy.bookingOpensAt > now ? (
            <Alert>
              <AlertDescription>Booking opens {fmt(policy.bookingOpensAt, tz)}.</AlertDescription>
            </Alert>
          ) : days.size === 0 ? (
            <EmptyState title="No slots available right now">Check back later — your TA may add more times.</EmptyState>
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
                    });
                    return (
                      <ActionForm
                        key={s.id}
                        action={rescheduling ? rescheduleAction : bookSlotAction}
                        compact
                        confirm={rescheduling ? `Move your demo to ${fmtRange(s.startsAt, s.endsAt, tz)}?` : undefined}
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

      {history.filter((b) => b.status === "CANCELLED").length > 0 && (
        <details className="text-sm text-muted-foreground">
          <summary className="cursor-pointer">Booking history</summary>
          <ul className="mt-2 space-y-1">
            {history
              .filter((b) => b.status === "CANCELLED")
              .map((b) => (
                <li key={b.id}>
                  {fmtRange(b.slot.startsAt, b.slot.endsAt, tz)} — cancelled {b.cancelledAt && fmt(b.cancelledAt, tz, "d MMM HH:mm")}
                </li>
              ))}
          </ul>
        </details>
      )}
    </div>
  );
}
