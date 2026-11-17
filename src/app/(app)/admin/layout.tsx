import { requireAdminUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { CourseNav } from "../courses/[courseId]/manage/course-nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminUser();
  const [failed, newFeedback] = await Promise.all([db.emailOutbox.count({ where: { status: "FAILED" } }), db.feedback.count({ where: { status: "NEW" } })]);
  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold tracking-tight">Administration</h1>
      <CourseNav
        base="/admin"
        items={[
          { href: "", label: "Overview" },
          { href: "/users", label: "Users" },
          { href: "/courses", label: "Courses" },
          { href: "/email", label: "Email", badge: failed },
          { href: "/insights", label: "Insights" },
          { href: "/feedback", label: "Feedback", badge: newFeedback },
          { href: "/audit", label: "Audit log" },
        ]}
      />
      {children}
    </div>
  );
}
