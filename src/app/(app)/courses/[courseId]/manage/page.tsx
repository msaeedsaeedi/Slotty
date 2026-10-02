import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";
import { EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth/session";
import { load } from "@/server/page-utils";
import { courseProgress, type AssignmentProgress } from "@/server/services/reports";

const STATE = {
  DRAFT: { label: "Not open yet", className: "bg-muted text-muted-foreground" },
  PUBLISHED: { label: "Booking open", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" },
  CLOSED: { label: "Booking closed", className: "bg-muted text-muted-foreground" },
} as Record<string, { label: string; className: string }>;

/** The single most useful thing to do next for an assignment, and how urgent it is. */
function nextStep(a: AssignmentProgress): { text: string; tone: "danger" | "warning" | "info" | "done" } {
  if (a.status === "DRAFT") return a.slots ? { text: `${a.slots} slots ready — open booking when you're set`, tone: "info" } : { text: "Add slots, then open booking", tone: "info" };
  if (a.needsAttendance) return { text: `${a.needsAttendance} past demo${a.needsAttendance === 1 ? " needs" : "s need"} attendance`, tone: "danger" };
  const toMark = a.completed - a.submitted - a.finalized;
  if (toMark > 0) return { text: `${toMark} demo${toMark === 1 ? "" : "s"} to mark`, tone: "warning" };
  if (a.submitted) return { text: `${a.submitted} mark${a.submitted === 1 ? "" : "s"} awaiting review`, tone: "warning" };
  if (a.status === "PUBLISHED" && a.unbooked) return { text: `${a.unbooked} student${a.unbooked === 1 ? " hasn't" : "s haven't"} booked yet`, tone: "info" };
  if (a.booked) return { text: `${a.booked} demo${a.booked === 1 ? "" : "s"} coming up`, tone: "info" };
  return { text: "Nothing waiting", tone: "done" };
}

const TONE = {
  danger: "text-red-700 dark:text-red-400",
  warning: "text-amber-700 dark:text-amber-400",
  info: "text-foreground",
  done: "text-muted-foreground",
};

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
        <EmptyState title="No assignments yet">Create an assignment, add the times you&apos;re available, then open booking for students.</EmptyState>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {progress.map((a) => {
            const step = nextStep(a);
            const bookedAny = a.booked + a.completed + a.noShow;
            const marked = a.submitted + a.finalized;
            const state = STATE[a.status];
            return (
              <Link key={a.id} href={`/courses/${courseId}/manage/assignments/${a.id}`} className="group">
                <Card className="h-full gap-3 p-4 transition-colors group-hover:border-primary/40">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold">{a.title}</p>
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", state.className)}>{state.label}</span>
                  </div>
                  <p className={cn("flex items-center gap-1 text-sm font-medium", TONE[step.tone])}>
                    {step.text}
                    <ChevronRight className="size-4 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                  </p>
                  {a.status !== "DRAFT" && a.students > 0 && (
                    <div className="space-y-1.5">
                      <Meter label="Booked" value={bookedAny} of={a.students} className="bg-blue-500" />
                      <Meter label="Marked" value={marked} of={a.students} className="bg-emerald-500" />
                    </div>
                  )}
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** One labelled bar: what it counts is written next to it, so there's nothing to decode. */
function Meter({ label, value, of, className }: { label: string; value: number; of: number; className: string }) {
  const pct = of ? Math.round((value / of) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-14 shrink-0 text-muted-foreground">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={of} aria-valuenow={value}>
        <div className={cn("h-full rounded-full", className)} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-14 shrink-0 text-right tabular-nums">
        {value} of {of}
      </span>
    </div>
  );
}
