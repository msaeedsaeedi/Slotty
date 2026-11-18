import { createCourseAction } from "@/app/actions/courses";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { CourseFields } from "../course-fields";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { canCreateCourseFor } from "@/server/services/courses";
import { EmptyState } from "@/components/page-header";

export const metadata = { title: "New course" };

export default async function NewCoursePage() {
  // Admins don't join courses: they create one from the console and hand it to its staff.
  const user = await requireUser();
  if (user.isAdmin) redirect("/admin/courses?new=1");
  const allowed = await canCreateCourseFor(user);
  if (!allowed.ok) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="New course" back={{ href: "/dashboard", label: "Dashboard" }} />
        <EmptyState title="You can't create a course">{allowed.reason}</EmptyState>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="New course"
        description="Set up a course as its TA, then import your class list. You don't need an instructor or admin to get started."
        back={{ href: "/dashboard", label: "Dashboard" }}
      />
      <Card>
        <CardContent>
          <ActionForm action={createCourseAction} className="space-y-5">
            <CourseFields />
            <p className="text-xs text-muted-foreground">
              You&apos;ll be the course&apos;s TA. Instructors are added by a Slotty admin; once a course has one, TA marks go to them for
              review. Without one, TA submissions are final.
            </p>
            <SubmitButton>Create course</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
