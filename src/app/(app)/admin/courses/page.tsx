import Link from "next/link";
import { Plus } from "lucide-react";
import { assignStaffAction, createCourseAction, setCourseArchivedAction } from "@/app/actions/admin";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { EmptyState } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { tzLabel } from "@/lib/time";
import { CourseFields } from "../../courses/course-fields";
import { Input } from "@/components/ui/input";
import { requireAdminUser } from "@/server/auth/session";
import { adminListCourses, type CourseFilter } from "@/server/services/admin";
import { FilterTabs, query } from "../filter-tabs";

export const metadata = { title: "All courses" };

const FILTERS = [
  ["active", "Active"],
  ["no-staff", "No staff"],
  ["archived", "Archived"],
  ["all", "All"],
] as const;

export default async function AdminCoursesPage({ searchParams }: PageProps<"/admin/courses">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const filter = (FILTERS.find(([v]) => v === sp.filter)?.[0] ?? "active") as CourseFilter;
  const user = await requireAdminUser();
  const courses = await adminListCourses(user, { q, filter });

  return (
    <div className="space-y-4">
      <details className="rounded-xl border bg-card p-4" open={sp.new === "1" || undefined}>
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
          <Plus className="size-4" /> New course
        </summary>
        <ActionForm action={createCourseAction} resetOnSuccess className="mt-4 space-y-4">
          <CourseFields />
          <fieldset className="space-y-2">
            <Label asChild>
              <legend>Who runs it</legend>
            </Label>
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <Input name="email" type="email" required placeholder="Email" aria-label="Instructor or TA email" />
              <Input name="name" placeholder="Name (if new to Slotty)" aria-label="Instructor or TA name" maxLength={120} />
              <select name="role" defaultValue="INSTRUCTOR" aria-label="Their role" className="h-8 rounded-md border bg-background px-2 text-sm">
                <option value="INSTRUCTOR">Instructor</option>
                <option value="TA">TA</option>
              </select>
            </div>
            <p className="text-xs text-muted-foreground">They get an invite, or a notification if they already use Slotty.</p>
          </fieldset>
          <SubmitButton>Create course</SubmitButton>
        </ActionForm>
      </details>

      <form className="flex max-w-md gap-2" role="search">
        <Input name="q" type="search" placeholder="Search code, title or term" aria-label="Search courses" defaultValue={q} />
        {filter !== "active" && <input type="hidden" name="filter" value={filter} />}
      </form>
      <FilterTabs label="Filter courses" current={filter} options={FILTERS} hrefFor={(v) => query("/admin/courses", { q, filter: v === "active" ? undefined : v })} />

      {courses.length === 0 ? (
        <EmptyState title={filter === "no-staff" ? "Every active course has staff" : "No courses match"} />
      ) : (
        <ul className="space-y-3">
          {courses.map((c) => {
            const noStaff = c.instructors.length === 0 && c.tas.length === 0;
            return (
              <li key={c.id}>
                <Card className="gap-3 p-4 text-sm">
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <Link href={`/courses/${c.id}/manage`} className="font-medium hover:underline">
                        {c.code} — {c.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {c.term} · {tzLabel(c.timezone)}
                      </p>
                    </div>
                    {c.archived && <StatusBadge status="ARCHIVED" label="Archived" />}
                    {noStaff && !c.archived && <StatusBadge status="NO_STAFF" label="No staff" tone="danger" />}
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
                    <Stat label="Students" value={c.students} />
                    <Stat label="Open assignments" value={c.openAssignments} />
                    <Stat label="Upcoming demos" value={c.upcomingDemos} />
                    <div>
                      <dt className="text-xs text-muted-foreground">Staff</dt>
                      <dd className="truncate">
                        {noStaff ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          [...c.instructors.map((u) => `${u.name} (instructor)`), ...c.tas.map((u) => u.name)].join(", ")
                        )}
                      </dd>
                    </div>
                  </dl>
                  <div className="flex flex-wrap items-start gap-2 border-t pt-3">
                    {!c.archived && (
                      <details className="group flex-1" open={noStaff || undefined}>
                        <summary className="cursor-pointer text-sm font-medium text-primary">{noStaff ? "Assign staff" : "Add staff member"}</summary>
                        <ActionForm action={assignStaffAction} resetOnSuccess className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
                          <input type="hidden" name="courseId" value={c.id} />
                          <Input name="email" type="email" required placeholder="Email" aria-label={`Staff email for ${c.code}`} />
                          <Input name="name" placeholder="Name (if new to Slotty)" aria-label={`Staff name for ${c.code}`} maxLength={120} />
                          <select name="role" defaultValue="INSTRUCTOR" aria-label="Role" className="h-8 rounded-md border bg-background px-2 text-sm">
                            <option value="INSTRUCTOR">Instructor</option>
                            <option value="TA">TA</option>
                          </select>
                          <SubmitButton size="sm">Add</SubmitButton>
                        </ActionForm>
                      </details>
                    )}
                    <ActionForm
                      action={setCourseArchivedAction}
                      compact
                      className="ml-auto"
                      confirm={c.archived ? undefined : `Archive ${c.code}? It becomes read-only and leaves everyone's dashboard. You can restore it later.`}
                      confirmLabel="Archive course"
                    >
                      <input type="hidden" name="courseId" value={c.id} />
                      <input type="hidden" name="archived" value={c.archived ? "false" : "true"} />
                      <SubmitButton size="sm" variant="ghost">
                        {c.archived ? "Restore" : "Archive"}
                      </SubmitButton>
                    </ActionForm>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
