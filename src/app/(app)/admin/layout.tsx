import { requireAdminUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { CourseNav } from "../courses/[courseId]/manage/course-nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminUser();
  const [failed, held] = await Promise.all([
    db.emailOutbox.count({ where: { status: "FAILED" } }),
    db.evaluation.count({ where: { status: "SUBMITTED", releaseAt: { not: null } } }),
  ]);
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
          { href: "/marks", label: "Held marks", badge: held },
          { href: "/audit", label: "Audit log" },
        ]}
      />
      {children}
    </div>
  );
}
