import { deleteAssignmentAction, updateAssignmentAction } from "@/app/actions/scheduling";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toLocalInput, tzLabel } from "@/lib/time";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { load } from "@/server/page-utils";
import { getAssignment } from "@/server/services/assignments";
import { AssignmentForm } from "../../assignment-form";

export const metadata = { title: "Edit assignment" };

export default async function EditAssignmentPage({ params }: PageProps<"/courses/[courseId]/manage/assignments/[assignmentId]/edit">) {
  const { courseId, assignmentId } = await params;
  const user = await requireUser();
  const { assignment, criteria } = await load(getAssignment(user, assignmentId));
  const tz = assignment.course.timezone;
  const p = assignment.policy!;
  const [scored, booked, everBooked, topMark] = await Promise.all([
    db.evaluationScore.count({ where: { criterion: { assignmentId } } }),
    db.booking.count({ where: { assignmentId, status: "BOOKED" } }),
    db.booking.count({ where: { assignmentId } }),
    db.evaluation.aggregate({ where: { assignmentId }, _max: { totalMarks: true } }),
  ]);
  return (
    <div className="max-w-5xl">
      <PageHeader
        title={`Edit ${assignment.title}`}
        description="Changes to slot length or capacity apply to slots you add from now on."
        back={{ href: `/courses/${courseId}/manage/assignments/${assignmentId}`, label: assignment.title }}
      />
      {(booked > 0 || topMark._max.totalMarks !== null) && (
        <Alert className="mb-6">
          <AlertDescription>
            <ul className="list-disc space-y-1 pl-4">
              {booked > 0 && (
                <li>
                  {booked} student{booked === 1 ? " has" : "s have"} a booking. They&apos;ll be notified if you change when changes lock, how many
                  changes are allowed, or whether they can cancel. The demo window must still cover their booked slots.
                </li>
              )}
              {topMark._max.totalMarks !== null && <li>Max marks can&apos;t go below the highest mark already given ({topMark._max.totalMarks}).</li>}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      <AssignmentForm
        action={updateAssignmentAction}
        courseId={courseId}
        assignmentId={assignmentId}
        timezoneLabel={tzLabel(tz)}
        rubricLocked={scored > 0}
        defaults={{
          title: assignment.title,
          description: assignment.description,
          maxMarks: assignment.maxMarks,
          criteria: criteria.map((c) => ({ label: c.label, maxPoints: c.maxPoints })),
          windowStart: toLocalInput(p.windowStart, tz),
          windowEnd: toLocalInput(p.windowEnd, tz),
          slotDurationMin: p.slotDurationMin,
          bufferMin: p.bufferMin,
          capacityPerSlot: p.capacityPerSlot,
          bookingOpensAt: p.bookingOpensAt ? toLocalInput(p.bookingOpensAt, tz) : "",
          freezeHours: p.freezeHours,
          maxReschedules: p.maxReschedules,
          allowStudentCancel: p.allowStudentCancel,
        }}
      />
      <Card className="mt-8 border-destructive/40">
        <CardHeader>
          <CardTitle className="text-base">Delete assignment</CardTitle>
          <CardDescription>
            {everBooked > 0
              ? "Students have booked this assignment, so it can't be deleted. Close booking instead; the record stays for marking and export."
              : "Removes the assignment and all its slots. Nobody has booked it yet."}
          </CardDescription>
        </CardHeader>
        {everBooked === 0 && (
          <CardContent>
            <ActionForm action={deleteAssignmentAction} compact confirmLabel="Delete" confirm={`Delete ${assignment.title} and all its slots? This can't be undone.`}>
              <input type="hidden" name="assignmentId" value={assignmentId} />
              <input type="hidden" name="courseId" value={courseId} />
              <SubmitButton variant="destructive" size="sm">
                Delete assignment
              </SubmitButton>
            </ActionForm>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
