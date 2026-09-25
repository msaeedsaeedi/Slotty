import { archiveCourseAction, updateCourseAction } from "@/app/actions/courses";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/server/auth/session";
import { load } from "@/server/page-utils";
import { getCourseForActor } from "@/server/services/courses";
import { CourseFields } from "../../../course-fields";

export const metadata = { title: "Course settings" };

export default async function SettingsPage({ params }: PageProps<"/courses/[courseId]/manage/settings">) {
  const { courseId } = await params;
  const user = await requireUser();
  const { course } = await load(getCourseForActor(user, courseId));
  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Course details</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={updateCourseAction} className="space-y-4">
            <input type="hidden" name="courseId" value={courseId} />
            <CourseFields defaults={course} />
            <SubmitButton>Save</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{course.archived ? "Restore course" : "Archive course"}</CardTitle>
          <CardDescription>
            {course.archived
              ? "Bring the course back to everyone's dashboard."
              : "Hide the course from dashboards at the end of term. Records and exports stay available."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={archiveCourseAction} compact>
            <input type="hidden" name="courseId" value={courseId} />
            <input type="hidden" name="archived" value={course.archived ? "false" : "true"} />
            <SubmitButton variant="outline">{course.archived ? "Restore" : "Archive"}</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
