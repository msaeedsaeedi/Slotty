import Link from "next/link";
import { Plus } from "lucide-react";
import { EmptyState } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/server/auth/session";
import { load } from "@/server/page-utils";
import { courseProgress } from "@/server/services/reports";

export default async function ManageCoursePage({ params }: PageProps<"/courses/[courseId]/manage">) {
  const { courseId } = await params;
  const user = await requireUser();
  const progress = await load(courseProgress(user, courseId));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Assignments</h2>
        <Button asChild>
          <Link href={`/courses/${courseId}/manage/assignments/new`}>
            <Plus /> New assignment
          </Link>
        </Button>
      </div>
      {progress.length === 0 ? (
        <EmptyState title="No assignments yet">
          Create an assignment, set its demo rules and your availability, then publish it for students to book.
        </EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {progress.map((a) => {
            const pct = (n: number) => (a.students ? Math.round((n / a.students) * 100) : 0);
            const bookedAny = a.booked + a.completed + a.noShow;
            return (
              <Link key={a.id} href={`/courses/${courseId}/manage/assignments/${a.id}`}>
                <Card className="h-full transition-colors hover:border-primary/40">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle>{a.title}</CardTitle>
                      <StatusBadge status={a.status} />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div>
                      <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                        <span>
                          {bookedAny}/{a.students} booked
                        </span>
                        <span>
                          {a.finalized}/{a.students} finalized
                        </span>
                      </div>
                      <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                        <div className="bg-emerald-500" style={{ width: `${pct(a.completed)}%` }} title="Completed" />
                        <div className="bg-blue-500" style={{ width: `${pct(a.booked)}%` }} title="Booked" />
                        <div className="bg-red-400" style={{ width: `${pct(a.noShow)}%` }} title="No-show" />
                      </div>
                    </div>
                    <dl className="grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
                      {[
                        ["Unbooked", a.unbooked],
                        ["Booked", a.booked],
                        ["Done", a.completed],
                        ["No-show", a.noShow],
                        ["Review", a.submitted],
                        ["Final", a.finalized],
                      ].map(([label, n]) => (
                        <div key={label} className="rounded-md bg-muted/60 p-1.5">
                          <dd className="font-semibold tabular-nums">{n}</dd>
                          <dt className="text-[11px] text-muted-foreground">{label}</dt>
                        </div>
                      ))}
                    </dl>
                    {a.needsAttendance > 0 && (
                      <p className="rounded-md bg-amber-100 px-2 py-1 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                        {a.needsAttendance} past demo{a.needsAttendance === 1 ? " needs" : "s need"} attendance recorded
                      </p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
