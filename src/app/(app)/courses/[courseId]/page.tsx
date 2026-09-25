import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { fmt, fmtRange } from "@/lib/time";
import { requireUser } from "@/server/auth/session";
import { load } from "@/server/page-utils";
import { listAssignments } from "@/server/services/assignments";
import { listMyBookings } from "@/server/services/bookings";
import { getCourseForActor } from "@/server/services/courses";
import { db } from "@/server/db";

export default async function StudentCoursePage({ params }: PageProps<"/courses/[courseId]">) {
  const { courseId } = await params;
  const user = await requireUser();
  const { course, role } = await load(getCourseForActor(user, courseId));
  if (role !== "STUDENT") redirect(`/courses/${courseId}/manage`);

  const [assignments, bookings, finalized] = await Promise.all([
    listAssignments(user, courseId),
    listMyBookings(user),
    db.evaluation.findMany({
      where: { studentId: user.id, status: "FINALIZED", assignment: { courseId } },
      select: { assignmentId: true, totalMarks: true },
    }),
  ]);
  const tz = course.timezone;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={course.title} description={`${course.code} · ${course.term}`} back={{ href: "/dashboard", label: "Dashboard" }} />
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">Assignments with demos</h2>
      {assignments.length === 0 ? (
        <EmptyState title="Nothing to book yet">You&apos;ll get a notification when demo slots open.</EmptyState>
      ) : (
        <Card className="divide-y p-0">
          {assignments.map((a) => {
            const booking = bookings.find((b) => b.assignmentId === a.id && b.status !== "CANCELLED");
            const result = finalized.find((f) => f.assignmentId === a.id);
            let status: React.ReactNode;
            if (result) status = <StatusBadge status="FINALIZED" label={`Marked: ${result.totalMarks}/${a.maxMarks}`} />;
            else if (booking) status = <StatusBadge status={booking.status} />;
            else if (a.status === "CLOSED") status = <StatusBadge status="CLOSED" />;
            else status = <StatusBadge status="NOT_BOOKED" label="Not booked" tone="warning" />;
            return (
              <Link key={a.id} href={`/courses/${courseId}/assignments/${a.id}`} className="flex items-center gap-3 p-4 hover:bg-muted/50">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{a.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {booking
                      ? fmtRange(booking.slot.startsAt, booking.slot.endsAt, tz)
                      : a.policy
                        ? `Demos ${fmt(a.policy.windowStart, tz, "d MMM")} – ${fmt(a.policy.windowEnd, tz, "d MMM")}`
                        : ""}
                  </p>
                </div>
                {status}
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
            );
          })}
        </Card>
      )}
    </div>
  );
}
