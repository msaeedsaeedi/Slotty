import { redirect } from "next/navigation";
import { StatusBadge } from "@/components/status-badge";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { load } from "@/server/page-utils";
import { getCourseForActor } from "@/server/services/courses";
import { openRequestCount } from "@/server/services/requests";
import { CourseNav } from "./course-nav";

export default async function ManageLayout({ children, params }: LayoutProps<"/courses/[courseId]/manage">) {
  const { courseId } = await params;
  const user = await requireUser();
  const { course, role } = await load(getCourseForActor(user, courseId));
  if (role === "STUDENT") redirect(`/courses/${courseId}`);
  const [pendingReview, openRequests] = await Promise.all([
    role === "INSTRUCTOR" ? db.evaluation.count({ where: { status: "SUBMITTED", assignment: { courseId } } }) : 0,
    openRequestCount(courseId),
  ]);

  const items = [
    { href: "", label: "Assignments" },
    { href: "/today", label: "Today" },
    { href: "/requests", label: "Requests", badge: openRequests },
    ...(role === "INSTRUCTOR" ? [{ href: "/review", label: "Review", badge: pendingReview }] : []),
    { href: "/roster", label: "People" },
    { href: "/venues", label: "Venues" },
    { href: "/settings", label: "Settings" },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">
            {course.code} · {course.term}
          </p>
          <h1 className="text-xl font-semibold tracking-tight">{course.title}</h1>
        </div>
        <StatusBadge status={role} className="ml-auto" />
        {user.isAdmin && role === "INSTRUCTOR" && !(await db.enrollment.findFirst({ where: { courseId, userId: user.id } })) && (
          <StatusBadge status="ADMIN" label="Viewing as admin" tone="warning" />
        )}
        {course.archived && <StatusBadge status="ARCHIVED" label="Archived" />}
      </div>
      <CourseNav base={`/courses/${courseId}/manage`} items={items} />
      {children}
    </div>
  );
}
