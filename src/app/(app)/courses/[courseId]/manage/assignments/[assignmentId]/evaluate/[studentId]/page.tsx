import { markAttendanceAction } from "@/app/actions/bookings";
import { reviewAction, unlockAction } from "@/app/actions/evaluations";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fmtRange } from "@/lib/time";
import { requireUser } from "@/server/auth/session";
import { load } from "@/server/page-utils";
import { courseHasInstructor, courseRoleOf } from "@/server/services/access";
import { getStudentBookingControls } from "@/server/services/bookings";
import { getOrCreateEvaluation } from "@/server/services/evaluations";
import { db } from "@/server/db";
import { BookingControls } from "./booking-controls";
import { EvaluationForm } from "./evaluation-form";

export const metadata = { title: "Student demo" };

export default async function EvaluatePage({ params, searchParams }: PageProps<"/courses/[courseId]/manage/assignments/[assignmentId]/evaluate/[studentId]">) {
  const { courseId, assignmentId, studentId } = await params;
  const { returnTo } = await searchParams;
  const user = await requireUser();
  const ev = await load(getOrCreateEvaluation(user, assignmentId, studentId));
  const [role, hasInstructor, controls] = await Promise.all([
    courseRoleOf(db, user, courseId),
    courseHasInstructor(db, courseId),
    getStudentBookingControls(user, assignmentId, studentId),
  ]);
  const tz = ev.assignment.course.timezone;
  const back = typeof returnTo === "string" && returnTo.startsWith("/") ? returnTo : `/courses/${courseId}/manage/assignments/${assignmentId}?tab=students`;
  const editable = ev.status === "DRAFT" || ev.status === "RETURNED";
  const booking = ev.booking;
  const notStarted = booking ? booking.slot.startsAt > new Date() : false;
  const canUnlock = ev.status === "FINALIZED" && (role === "INSTRUCTOR" || !hasInstructor);
  const scoreBy = new Map(ev.scores.map((s) => [s.criterionId, s]));

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title={ev.student.name}
        description={`${ev.assignment.title} · ${ev.student.email}`}
        back={{ href: back, label: /^\/today|\/manage\/today/.test(back) ? "Back to demo day" : "Back" }}
        actions={<StatusBadge status={ev.status} />}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Demo</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3 text-sm">
          {booking ? (
            <>
              <span>
                {fmtRange(booking.slot.startsAt, booking.slot.endsAt, tz)} · {booking.slot.venue?.name ?? "No venue"}
              </span>
              <StatusBadge status={booking.status} label={booking.status === "BOOKED" ? "Pending" : undefined} />
              {editable && (
                <div className="ml-auto flex gap-1">
                  {(["COMPLETED", "NO_SHOW", "BOOKED"] as const)
                    .filter((s) => s !== booking.status)
                    .map((s) => (
                      <ActionForm key={s} action={markAttendanceAction} compact>
                        <input type="hidden" name="bookingId" value={booking.id} />
                        <input type="hidden" name="status" value={s} />
                        <SubmitButton
                          size="sm"
                          variant={s === "BOOKED" ? "ghost" : "outline"}
                          disabled={s !== "BOOKED" && notStarted}
                          title={s !== "BOOKED" && notStarted ? "Available once the demo starts" : undefined}
                        >
                          {s === "COMPLETED" ? "Completed" : s === "NO_SHOW" ? "No-show" : "Pending"}
                        </SubmitButton>
                      </ActionForm>
                    ))}
                </div>
              )}
            </>
          ) : (
            <span className="text-muted-foreground">No booking — you can still record marks (e.g. a demo arranged outside Slotty).</span>
          )}
        </CardContent>
      </Card>

      {!ev.assignment.course.archived && (
        <BookingControls
          assignmentId={assignmentId}
          student={ev.student}
          booking={booking && booking.status !== "CANCELLED" ? booking : null}
          budget={controls.budget}
          allowance={controls.allowance}
          slots={controls.slots}
          timezone={tz}
        />
      )}

      {ev.status === "RETURNED" && ev.reviewComment && (
        <Alert>
          <AlertDescription>
            <span className="font-medium">Returned{ev.reviewedBy ? ` by ${ev.reviewedBy.name}` : ""}:</span> {ev.reviewComment}
          </AlertDescription>
        </Alert>
      )}

      {editable ? (
        <EvaluationForm
          evaluationId={ev.id}
          returnTo={back}
          maxMarks={ev.assignment.maxMarks}
          criteria={ev.assignment.criteria}
          submitLabel={hasInstructor ? "Submit for review" : "Submit & release marks"}
          initial={{
            scores: Object.fromEntries(ev.scores.map((s) => [s.criterionId, { points: String(s.points), comment: s.comment ?? "" }])),
            totalMarks: ev.totalMarks?.toString() ?? "",
            totalOverride: ev.totalOverride,
            overrideNote: ev.overrideNote ?? "",
            feedback: ev.feedback ?? "",
            privateNotes: ev.privateNotes ?? "",
          }}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-baseline justify-between">
              <span>Marks</span>
              <span className="tabular-nums">
                {ev.totalMarks}
                <span className="text-sm font-normal text-muted-foreground">/{ev.assignment.maxMarks}</span>
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {ev.assignment.criteria.length > 0 && (
              <ul className="divide-y rounded-lg border">
                {ev.assignment.criteria.map((c) => (
                  <li key={c.id} className="flex justify-between gap-2 p-2">
                    <span>
                      {c.label}
                      {scoreBy.get(c.id)?.comment && <span className="block text-muted-foreground">{scoreBy.get(c.id)?.comment}</span>}
                    </span>
                    <span className="tabular-nums">
                      {scoreBy.get(c.id)?.points ?? "–"}/{c.maxPoints}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {ev.totalOverride && <p className="text-amber-700 dark:text-amber-400">Total overridden: {ev.overrideNote}</p>}
            {ev.feedback && <p><span className="font-medium">Feedback:</span> {ev.feedback}</p>}
            {ev.privateNotes && <p className="text-muted-foreground"><span className="font-medium">Private notes:</span> {ev.privateNotes}</p>}
            <p className="text-xs text-muted-foreground">
              Marked by {ev.evaluator.name}
              {ev.reviewedBy && ev.status === "FINALIZED" && ` · finalized by ${ev.reviewedBy.name}`}
            </p>

            {ev.status === "SUBMITTED" && role === "INSTRUCTOR" && (
              <div className="flex flex-wrap gap-2 border-t pt-3">
                <ActionForm action={reviewAction} compact>
                  <input type="hidden" name="evaluationId" value={ev.id} />
                  <input type="hidden" name="decision" value="finalize" />
                  <SubmitButton size="sm">Finalize</SubmitButton>
                </ActionForm>
                <ActionForm action={reviewAction} compact className="flex flex-1 gap-2">
                  <input type="hidden" name="evaluationId" value={ev.id} />
                  <input type="hidden" name="decision" value="return" />
                  <Input name="comment" placeholder="Comment for the TA" className="h-7 min-w-0 flex-1" />
                  <SubmitButton size="sm" variant="outline">
                    Return
                  </SubmitButton>
                </ActionForm>
              </div>
            )}
            {ev.status === "SUBMITTED" && role !== "INSTRUCTOR" && (
              <p className="border-t pt-3 text-muted-foreground">Waiting for the instructor to review.</p>
            )}
            {canUnlock && (
              <ActionForm action={unlockAction} compact className="flex gap-2 border-t pt-3">
                <input type="hidden" name="evaluationId" value={ev.id} />
                <Input name="reason" placeholder="Reason for unlocking" className="h-7" required />
                <SubmitButton size="sm" variant="outline">
                  Unlock to edit
                </SubmitButton>
              </ActionForm>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
