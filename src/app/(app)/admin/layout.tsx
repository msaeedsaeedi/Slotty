import { requireAdminUser } from "@/server/auth/session";
import { CourseNav } from "../courses/[courseId]/manage/course-nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminUser();
  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold tracking-tight">Admin</h1>
      <CourseNav
        base="/admin"
        items={[
          { href: "/users", label: "Users" },
          { href: "/courses", label: "Courses" },
          { href: "/audit", label: "Audit log" },
        ]}
      />
      {children}
    </div>
  );
}
