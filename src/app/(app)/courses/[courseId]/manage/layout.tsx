import Link from "@/components/app-link";
import { redirect } from "next/navigation";
import { StatusBadge } from "@/components/status-badge";
import { db } from "@/server/db";
import { pendingReviewCount } from "@/server/services/evaluations";
import { requireUser } from "@/server/auth/session";
import { load } from "@/server/page-utils";
import { getCourseForActor } from "@/server/services/courses";
import { openRequestCount } from "@/server/services/requests";
import { canManageCourseFor } from "@/server/services/access";
import { CourseChrome } from "./course-nav";

export default async function ManageLayout({ children, params }: LayoutProps<"/courses/[courseId]/manage">) {
  const { courseId } = await params;
  const user = await requireUser();
  const { course, role } = await load(getCourseForActor(user, courseId));
  if (role === "STUDENT") redirect(`/courses/${courseId}`);
  const [pendingReview, openRequests, manages] = await Promise.all([
    role === "INSTRUCTOR" ? pendingReviewCount(user, courseId) : 0,
    openRequestCount(user, courseId),
    canManageCourseFor(db, user, courseId),
  ]);

  const items = [
    { href: "", label: "Assignments" },
    { href: "/today", label: "Today" },
    { href: "/requests", label: "Requests", badge: openRequests },
    ...(role === "INSTRUCTOR" ? [{ href: "/review", label: "Review", badge: pendingReview }] : []),
    { href: "/roster", label: "People" },
    { href: "/venues", label: "Venues" },
    ...(manages ? [{ href: "/settings", label: "Settings" }] : []),
  ];

  const base = `/courses/${courseId}/manage`;
  const badges = (
    <>
      <StatusBadge status={user.isAdmin ? "ADMIN" : role} label={user.isAdmin ? "Viewing as admin" : undefined} tone={user.isAdmin ? "warning" : undefined} />
      {course.archived && <StatusBadge status="ARCHIVED" label="Archived" />}
    </>
  );

  return (
    <div>
      <CourseChrome
        base={base}
        items={items}
        header={
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-muted-foreground">
                {course.code} · {course.term}
              </p>
              <h1 className="text-xl font-semibold tracking-tight">{course.title}</h1>
            </div>
            {badges}
          </div>
        }
        slim={
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Link href={base} offlineFallback={`${base}/today`} className="hover:text-foreground hover:underline">
              {course.code} · {course.title}
            </Link>
            {badges}
          </p>
        }
      />
      {user.isAdmin && (
        <p role="note" className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          You&apos;re viewing this course as an admin, read-only. To add or remove staff, or archive the course, use{" "}
          <Link href="/admin/courses" className="font-medium underline">
            Administration → Courses
          </Link>
          .
        </p>
      )}
      {children}
    </div>
  );
}
