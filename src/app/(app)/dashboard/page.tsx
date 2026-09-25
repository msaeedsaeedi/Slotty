import Link from "next/link";
import { CalendarClock, MapPin, Plus, Users } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtRange } from "@/lib/time";
import { requireUser } from "@/server/auth/session";
import { listMyBookings } from "@/server/services/bookings";
import { listMyCourses } from "@/server/services/courses";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();
  const [courses, bookings] = await Promise.all([listMyCourses(user), listMyBookings(user)]);
  const upcoming = bookings
    .filter((b) => b.status === "BOOKED" && b.slot.endsAt > new Date())
    .sort((a, b) => a.slot.startsAt.getTime() - b.slot.startsAt.getTime());
  const active = courses.filter((c) => !c.archived);
  const archived = courses.filter((c) => c.archived);

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Hi, ${user.name.split(" ")[0]}`}
        description="Your courses and upcoming demos."
        actions={
          <Button asChild>
            <Link href="/courses/new">
              <Plus /> New course
            </Link>
          </Button>
        }
      />

      {upcoming.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">Upcoming demos</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {upcoming.map((b) => (
              <Link key={b.id} href={`/courses/${b.assignment.courseId}/assignments/${b.assignmentId}`}>
                <Card className="transition-colors hover:border-primary/40">
                  <CardHeader>
                    <CardDescription>{b.assignment.course.code}</CardDescription>
                    <CardTitle>{b.assignment.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    <p className="flex items-center gap-2">
                      <CalendarClock className="size-4 text-muted-foreground" />
                      {fmtRange(b.slot.startsAt, b.slot.endsAt, b.assignment.course.timezone)}
                    </p>
                    <p className="flex items-center gap-2">
                      <MapPin className="size-4 text-muted-foreground" />
                      {b.slot.venue?.name ?? "Venue TBA"} · with {b.slot.ta.name}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Courses</h2>
        {active.length === 0 ? (
          <EmptyState title="No courses yet">
            Students: your TA or instructor adds you by email — you&apos;ll get a notification when they do.
            <br />
            Staff: create a course and import your class list.
          </EmptyState>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((c) => (
              <Link key={c.id} href={c.role === "STUDENT" ? `/courses/${c.id}` : `/courses/${c.id}/manage`}>
                <Card className="h-full transition-colors hover:border-primary/40">
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2">
                      <CardDescription>
                        {c.code} · {c.term}
                      </CardDescription>
                      <StatusBadge status={c.role} />
                    </div>
                    <CardTitle>{c.title}</CardTitle>
                  </CardHeader>
                  {c.role !== "STUDENT" && (
                    <CardContent className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Users className="size-4" /> {c.studentCount} students
                    </CardContent>
                  )}
                </Card>
              </Link>
            ))}
          </div>
        )}
        {archived.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">{archived.length} archived</summary>
            <ul className="mt-2 space-y-1">
              {archived.map((c) => (
                <li key={c.id}>
                  <Link className="hover:underline" href={c.role === "STUDENT" ? `/courses/${c.id}` : `/courses/${c.id}/manage`}>
                    {c.code} — {c.title} ({c.term})
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </div>
  );
}
