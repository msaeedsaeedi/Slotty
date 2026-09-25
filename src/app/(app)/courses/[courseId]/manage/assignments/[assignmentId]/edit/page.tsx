import { updateAssignmentAction } from "@/app/actions/scheduling";
import { PageHeader } from "@/components/page-header";
import { toLocalInput } from "@/lib/time";
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
  const scored = await db.evaluationScore.count({ where: { criterion: { assignmentId } } });
  return (
    <div className="max-w-3xl">
      <PageHeader
        title={`Edit ${assignment.title}`}
        description="Changes to slot length or capacity apply to slots you add from now on."
        back={{ href: `/courses/${courseId}/manage/assignments/${assignmentId}`, label: assignment.title }}
      />
      <AssignmentForm
        action={updateAssignmentAction}
        courseId={courseId}
        assignmentId={assignmentId}
        timezone={tz}
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
    </div>
  );
}
