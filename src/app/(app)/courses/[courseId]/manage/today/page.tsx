import { DemoDayView } from "@/components/demo-day";
import { requireUser } from "@/server/auth/session";
import { load } from "@/server/page-utils";
import { getDemoDay } from "@/server/services/demo-day";

export const metadata = { title: "Today" };

/** One course's demo day; instructors can switch to everyone's demos. */
export default async function CourseTodayPage({ params, searchParams }: PageProps<"/courses/[courseId]/manage/today">) {
  const { courseId } = await params;
  const { day, scope } = await searchParams;
  const user = await requireUser();
  const data = await load(
    getDemoDay(user, {
      courseId,
      day: typeof day === "string" ? day : undefined,
      scope: scope === "everyone" ? "everyone" : "mine",
    }),
  );
  return <DemoDayView data={data} now={new Date()} basePath={`/courses/${courseId}/manage/today`} scopeToggle />;
}
