import { addDays } from "date-fns";
import { createAssignmentAction } from "@/app/actions/scheduling";
import { PageHeader } from "@/components/page-header";
import { toLocalInput } from "@/lib/time";
import { requireUser } from "@/server/auth/session";
import { load } from "@/server/page-utils";
import { getCourseForActor } from "@/server/services/courses";
import { AssignmentForm } from "../assignment-form";

export const metadata = { title: "New assignment" };

export default async function NewAssignmentPage({ params }: PageProps<"/courses/[courseId]/manage/assignments/new">) {
  const { courseId } = await params;
  const user = await requireUser();
  const { course } = await load(getCourseForActor(user, courseId));
  const start = addDays(new Date(), 7);
  start.setUTCMinutes(0, 0, 0);
  return (
    <div className="max-w-3xl">
      <PageHeader title="New assignment" back={{ href: `/courses/${courseId}/manage`, label: "Assignments" }} />
      <AssignmentForm
        action={createAssignmentAction}
        courseId={courseId}
        timezone={course.timezone}
        defaults={{
          title: "",
          description: "",
          maxMarks: 10,
          criteria: [],
          windowStart: toLocalInput(start, course.timezone).slice(0, 11) + "08:00",
          windowEnd: toLocalInput(addDays(start, 7), course.timezone).slice(0, 11) + "18:00",
          slotDurationMin: 15,
          bufferMin: 0,
          capacityPerSlot: 1,
          bookingOpensAt: "",
          freezeHours: 12,
          maxReschedules: 2,
          allowStudentCancel: true,
        }}
      />
    </div>
  );
}
