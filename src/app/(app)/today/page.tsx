import Link from "next/link";
import { DemoDayView } from "@/components/demo-day";
import { EmptyState, PageHeader } from "@/components/page-header";
import { requireUser } from "@/server/auth/session";
import { getDemoDay } from "@/server/services/demo-day";

export const metadata = { title: "Demo day" };

/** The TA's home for running demos: every course they teach, their own demos by default. */
export default async function TodayPage({ searchParams }: PageProps<"/today">) {
  const { day, scope } = await searchParams;
  const user = await requireUser();
  const data = await getDemoDay(user, {
    day: typeof day === "string" ? day : undefined,
    scope: scope === "everyone" ? "everyone" : "mine",
  });

  if (data.courses.length === 0) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Demo day" />
        <EmptyState title="You don't run demos in any course">
          This page lists the demos you host as a TA or instructor.{" "}
          <Link className="underline" href="/dashboard">
            Back to your courses
          </Link>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Demo day"
        description={
          data.courses.length > 1 ? `Your demos across ${data.courses.map((c) => c.code).join(", ")}` : `${data.courses[0].code} · ${data.courses[0].title}`
        }
      />
      <DemoDayView data={data} now={new Date()} basePath="/today" scopeToggle />
    </div>
  );
}
