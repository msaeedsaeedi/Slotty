import { createCourseAction } from "@/app/actions/courses";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { CourseFields } from "../course-fields";
import { TimezoneDefault } from "./timezone-default";

export const metadata = { title: "New course" };

export default function NewCoursePage() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="New course"
        description="Set up a course, then import your class list. You don't need an instructor or admin to get started."
        back={{ href: "/dashboard", label: "Dashboard" }}
      />
      <Card>
        <CardContent>
          <ActionForm action={createCourseAction} className="space-y-5">
            <CourseFields />
            <TimezoneDefault />
            <fieldset className="space-y-2">
              <Label asChild>
                <legend>Your role in this course</legend>
              </Label>
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input type="radio" name="myRole" value="TA" defaultChecked /> Teaching assistant
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="myRole" value="INSTRUCTOR" /> Instructor
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                If the course has an instructor, TA evaluations go to them for review. Without one, TA submissions are final.
              </p>
            </fieldset>
            <SubmitButton>Create course</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
