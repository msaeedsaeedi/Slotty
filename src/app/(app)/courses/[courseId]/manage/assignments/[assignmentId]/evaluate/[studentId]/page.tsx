import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { clearMarksAction, reviewAction, unlockAction } from "@/app/actions/evaluations";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fmt, fmtRange, fmtTimeRange, tzLabel } from "@/lib/time";
import { requireUser } from "@/server/auth/session";
import { load } from "@/server/page-utils";
import { getStudentBookingControls } from "@/server/services/bookings";
import { getMarkingSheet, getStudentRecord } from "@/server/services/evaluations";
import { MarkingSheet } from "../../mark/marking-sheet";
import { BookingControls } from "./booking-controls";

export const metadata = { title: "Student" };

/**
 * One student's record for an assignment: booking (move, exceptions), marks at
 * a glance, and instructor review. Marks are entered on the marking sheet.
 */
export default async function StudentRecordPage({ params, searchParams }: PageProps<"/courses/[courseId]/manage/assignments/[assignmentId]/evaluate/[studentId]">) {
  const { courseId, assignmentId, studentId } = await params;
  const { returnTo } = await searchParams;
  const user = await requireUser();
  const rec = await load(getStudentRecord(user, assignmentId, studentId));
  const controls = await getStudentBookingControls(user, assignmentId, studentId);
  const { assignment, booking, evaluation: ev, student } = rec;
  const tz = assignment.course.timezone;
  const back = typeof returnTo === "string" && returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : `/courses/${courseId}/manage/assignments/${assignmentId}?tab=students`;
  const editable = !ev || ev.status === "DRAFT" || ev.status === "RETURNED";
  const canUnlock = ev?.status === "FINALIZED" && (rec.role === "INSTRUCTOR" || !rec.hasInstructor);
  const scoreBy = new Map(ev?.scores.map((s) => [s.criterionId, s]) ?? []);
  // Marks are entered right here, with the same editor as the marking sheet.
  const inline = editable && !assignment.course.archived && booking?.status !== "NO_SHOW";
  const sheet = inline ? await getMarkingSheet(user, assignmentId, { studentId }) : null;
  const row = sheet?.rows[0];

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title={student.name}
        description={
          <>
            {student.email}
            {rec.section && ` · Section ${rec.section}`} ·{" "}
            <Link className="underline" href={`/courses/${courseId}/manage/assignments/${assignmentId}`}>
              {assignment.title}
            </Link>
          </>
        }
        back={{ href: back, label: "Back" }}
        actions={ev ? <StatusBadge status={ev.status} /> : <StatusBadge status="NONE" label="Not marked" />}
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
              <StatusBadge status={booking.status} label={booking.status === "BOOKED" ? "Attendance not recorded" : booking.status === "COMPLETED" ? "Present" : undefined} />
            </>
          ) : (
            <span className="text-muted-foreground">No booking.</span>
          )}
        </CardContent>
      </Card>

      {ev?.noBookingReason && (
        <Alert>
          <AlertTriangle />
          <AlertDescription>Marked without a booking: “{ev.noBookingReason}”. This is recorded in the audit log.</AlertDescription>
        </Alert>
      )}
      {ev?.status === "RETURNED" && ev.reviewComment && (
        <Alert>
          <AlertDescription>
            <span className="font-medium">Returned{ev.reviewedBy ? ` by ${ev.reviewedBy.name}` : ""}:</span> {ev.reviewComment}
          </AlertDescription>
        </Alert>
      )}

      {inline && sheet && row && (
        <section aria-label="Marks" className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">Marks</h2>
            {ev && ev.totalMarks !== null && (
              <ActionForm action={clearMarksAction} compact className="flex items-center gap-2" confirmLabel="Clear marks" confirm={`Clear ${student.name}'s marks? They're kept in the audit log, and the booking can then be moved or cancelled.`}>
                <input type="hidden" name="evaluationId" value={ev.id} />
                <Input name="reason" required placeholder="Why clear them?" aria-label="Reason for clearing the marks" className="h-7 w-44" />
                <SubmitButton size="sm" variant="ghost">
                  Clear marks
                </SubmitButton>
              </ActionForm>
            )}
          </div>
          <MarkingSheet
            key={`${ev?.status}:${row.booking?.status}`}
            embedded
            assignment={{ id: assignmentId, title: assignment.title, maxMarks: assignment.maxMarks, courseId, courseCode: assignment.course.code }}
            criteria={sheet.criteria.map((c) => ({ id: c.id, label: c.label, maxPoints: c.maxPoints }))}
            rows={[
              {
                student: row.student,
                booking: row.booking && {
                  id: row.booking.id,
                  status: row.booking.status,
                  startsAt: row.booking.startsAt.toISOString(),
                  endsAt: row.booking.endsAt.toISOString(),
                  time: fmtTimeRange(row.booking.startsAt, row.booking.endsAt, tz),
                  day: fmt(row.booking.startsAt, tz, "EEE d MMM"),
                  venue: row.booking.venue,
                  host: row.booking.host,
                },
                evaluation: row.evaluation,
              },
            ]}
            hasInstructor={sheet.hasInstructor}
            finalOnSubmit={!sheet.hasInstructor || sheet.role === "INSTRUCTOR"}
            mode="student"
            isToday={false}
            title={student.name}
            timezoneLabel={tzLabel(tz)}
            now={new Date().toISOString()}
            links={{ back, course: `/courses/${courseId}/manage`, assignment: `/courses/${courseId}/manage/assignments/${assignmentId}`, details: `/courses/${courseId}/manage/assignments/${assignmentId}/evaluate` }}
          />
        </section>
      )}

      {!inline && (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-baseline justify-between gap-2">
            <span>Marks</span>
            <span className="tabular-nums">
              {ev?.totalMarks ?? "–"}
              <span className="text-sm font-normal text-muted-foreground">/{assignment.maxMarks}</span>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {rec.criteria.length > 0 && (
            <ul className="divide-y rounded-lg border">
              {rec.criteria.map((c) => (
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
          {ev?.totalOverride && <p className="text-amber-700 dark:text-amber-400">Total overridden: {ev.overrideNote}</p>}
          {ev?.feedback && (
            <p>
              <span className="font-medium">Feedback:</span> {ev.feedback}
            </p>
          )}
          {ev?.privateNotes && (
            <p className="text-muted-foreground">
              <span className="font-medium">Private note:</span> {ev.privateNotes}
            </p>
          )}
          {ev && (
            <p className="text-xs text-muted-foreground">
              Marked by {ev.evaluator.name}
              {ev.reviewedBy && ev.status === "FINALIZED" && ` · finalized by ${ev.reviewedBy.name}`}
            </p>
          )}

          {ev?.status === "SUBMITTED" && rec.role === "INSTRUCTOR" && (
            <div className="flex flex-wrap gap-2 border-t pt-3">
              <ActionForm action={reviewAction} compact>
                <input type="hidden" name="evaluationId" value={ev.id} />
                <input type="hidden" name="decision" value="finalize" />
                <SubmitButton size="sm">Finalize</SubmitButton>
              </ActionForm>
              <ActionForm action={reviewAction} compact className="flex flex-1 gap-2">
                <input type="hidden" name="evaluationId" value={ev.id} />
                <input type="hidden" name="decision" value="return" />
                <Input name="comment" placeholder="What should the TA change?" className="h-7 min-w-0 flex-1" aria-label="Comment for the TA" />
                <SubmitButton size="sm" variant="outline">
                  Return
                </SubmitButton>
              </ActionForm>
            </div>
          )}
          {ev?.status === "SUBMITTED" && rec.role !== "INSTRUCTOR" && <p className="border-t pt-3 text-muted-foreground">Waiting for the instructor to review.</p>}
          {canUnlock && (
            <ActionForm action={unlockAction} compact className="flex gap-2 border-t pt-3">
              <input type="hidden" name="evaluationId" value={ev.id} />
              <Input name="reason" placeholder="Reason for unlocking" className="h-7" required aria-label="Reason for unlocking" />
              <SubmitButton size="sm" variant="outline">
                Unlock to edit
              </SubmitButton>
            </ActionForm>
          )}
        </CardContent>
      </Card>

      )}

      {!assignment.course.archived && (
        <BookingControls
          assignmentId={assignmentId}
          student={student}
          booking={booking && booking.status !== "CANCELLED" ? booking : null}
          budget={controls.budget}
          allowance={controls.allowance}
          slots={controls.slots}
          timezone={tz}
        />
      )}
    </div>
  );
}
