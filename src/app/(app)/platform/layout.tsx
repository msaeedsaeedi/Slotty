import { requirePlatformUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { CourseNav } from "../courses/[courseId]/manage/course-nav";

/**
 * The product team's area: usage insights and feedback. Separate from the admin
 * console (which runs the deployment) and open only to a dedicated platform
 * account (ADR-016).
 */
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  await requirePlatformUser();
  const newFeedback = await db.feedback.count({ where: { status: "NEW" } });
  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold tracking-tight">Platform</h1>
      <CourseNav
        base="/platform"
        items={[
          { href: "/insights", label: "Insights" },
          { href: "/feedback", label: "Feedback", badge: newFeedback },
        ]}
      />
      {children}
    </div>
  );
}
