import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock, ExternalLink, GraduationCap, MapPin, Plus, Presentation, Users } from "lucide-react";
import { AddToCalendar } from "@/components/add-to-calendar";
import { DemoDaySummary } from "@/components/demo-day";
import { EmptyState, PageHeader } from "@/components/page-header";
import { InstallHint } from "@/components/pwa";
import { StatusBadge } from "@/components/status-badge";
import { TaskList } from "@/components/task-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fmt, fmtTimeRange } from "@/lib/time";
import { requireUser } from "@/server/auth/session";
import { bookingCalendarOptions } from "@/server/services/calendar";
import { getDemoDay } from "@/server/services/demo-day";
import { myRoleKinds } from "@/server/services/courses";
import { getHome, type Home } from "@/server/services/home";

export const metadata = { title: "Home" };

export default async function DashboardPage() {
  const user = await requireUser();
  // Admins run the platform and never join courses: the console is their home.
  if (user.isAdmin) redirect("/admin");
  const now = new Date();
  const home = await getHome(user, now);
  const roles = home.teaching ? await myRoleKinds(user) : null;
  const demoDay = roles?.hosts ? await getDemoDay(user, { now }) : null;
  const both = Boolean(home.teaching && home.studying);
  const firstName = user.name.split(" ")[0];

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Hi, ${firstName}`}
        description={both ? "You teach some courses and study in others — each has its own list below." : "Here's what needs you."}
        actions={
          (home.teaching || !home.hasAnyCourse) && (
            <Button asChild variant="outline">
              <Link href="/courses/new">
                <Plus /> New course
              </Link>
            </Button>
          )
        }
      />

      <InstallHint />

      {!home.hasAnyCourse && (
        <EmptyState title="You're not in any course yet">
          Students: your TA or instructor adds you by email, and you&apos;ll get a notification when they do.
          <br />
          Staff: create a course and add your class list.
        </EmptyState>
      )}

      {home.teaching && (
        <Section icon={Presentation} title="Teaching" subtitle={both ? "Courses you run as a TA or instructor" : undefined}>
          {demoDay && <DemoDaySummary data={demoDay} now={now} />}
          <TaskList tasks={home.teaching.tasks} empty="Nothing waiting on you in the courses you teach." />
          <CourseList courses={home.teaching.courses} staff />
        </Section>
      )}

      {home.studying && (
        <Section icon={GraduationCap} title="Studying" subtitle={both ? "Courses you take as a student" : undefined}>
          <UpcomingDemos upcoming={home.studying.upcoming} />
          <TaskList tasks={home.studying.tasks} empty="Nothing to book right now. We'll tell you when a new demo opens." />
          <CourseList courses={home.studying.courses} />
        </Section>
      )}

      {home.archived.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">{home.archived.length} archived course{home.archived.length === 1 ? "" : "s"}</summary>
          <ul className="mt-2 space-y-1">
            {home.archived.map((c) => (
              <li key={c.id}>
                <Link className="hover:underline" href={c.role === "STUDENT" ? `/courses/${c.id}` : `/courses/${c.id}/manage`}>
                  {c.code} — {c.title} ({c.term})
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Section({ icon: Icon, title, subtitle, children }: { icon: typeof Presentation; title: string; subtitle?: string; children: React.ReactNode }) {
  const id = `section-${title.toLowerCase()}`;
  return (
    <section aria-labelledby={id} className="space-y-3">
      <div className="flex items-baseline gap-2">
        <h2 id={id} className="flex items-center gap-2 text-lg font-semibold">
          <Icon className="size-5 text-primary" aria-hidden /> {title}
        </h2>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

type HomeCourse = NonNullable<Home["teaching"]>["courses"][number];

function CourseList({ courses, staff }: { courses: HomeCourse[]; staff?: boolean }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {courses.map((c) => (
        <Link key={c.id} href={staff ? `/courses/${c.id}/manage` : `/courses/${c.id}`}>
          <Card className="h-full gap-1 p-3 text-sm transition-colors hover:border-primary/40">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {c.code} · {c.term}
              </span>
              {staff && <StatusBadge status={c.role} />}
            </div>
            <p className="font-medium">{c.title}</p>
            {staff && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="size-3.5" /> {c.studentCount} student{c.studentCount === 1 ? "" : "s"}
              </p>
            )}
          </Card>
        </Link>
      ))}
    </div>
  );
}

function UpcomingDemos({ upcoming }: { upcoming: NonNullable<Home["studying"]>["upcoming"] }) {
  if (upcoming.length === 0) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {upcoming.map((b, i) => {
        const tz = b.assignment.course.timezone;
        const venue = b.slot.venue;
        return (
          <Card key={b.id} className={i === 0 ? "border-primary/50 ring-1 ring-primary/20" : undefined}>
            <CardHeader>
              <CardDescription>{i === 0 ? `Your next demo · ${b.assignment.course.code}` : b.assignment.course.code}</CardDescription>
              <CardTitle>
                <Link className="hover:underline" href={`/courses/${b.assignment.courseId}/assignments/${b.assignment.id}`}>
                  {b.assignment.title}
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className="flex items-center gap-2">
                <CalendarClock className="size-4 shrink-0 text-muted-foreground" />
                {fmt(b.slot.startsAt, tz, "EEE d MMM")}, {fmtTimeRange(b.slot.startsAt, b.slot.endsAt, tz)}
              </p>
              <p className="flex items-center gap-2">
                <MapPin className="size-4 shrink-0 text-muted-foreground" />
                {venue ? [venue.name, venue.location].filter(Boolean).join(", ") : "Venue to be announced"} · with {b.slot.ta.name}
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-2">
                {venue?.meetingUrl && (
                  <Button asChild size="sm">
                    <a href={venue.meetingUrl} target="_blank" rel="noreferrer">
                      <ExternalLink /> Join online
                    </a>
                  </Button>
                )}
                <AddToCalendar options={bookingCalendarOptions(b)} />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
