import Link from "next/link";
import { resolveRequestAction } from "@/app/actions/bookings";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { EmptyState } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { fmt, fmtRange } from "@/lib/time";
import { requireUser } from "@/server/auth/session";
import { load } from "@/server/page-utils";
import { getCourseForActor } from "@/server/services/courses";
import { listRequests } from "@/server/services/requests";

export const metadata = { title: "Requests" };

const KIND = { BOOKING_CHANGE: "Booking change", MARK_QUERY: "Question about marks" } as const;

export default async function RequestsPage({ params, searchParams }: PageProps<"/courses/[courseId]/manage/requests">) {
  const { courseId } = await params;
  const { show } = await searchParams;
  const user = await requireUser();
  const { course } = await load(getCourseForActor(user, courseId));
  const tz = course.timezone;
  const closed = show === "closed";
  const requests = await listRequests(user, courseId, closed ? "CLOSED" : "OPEN");
  const base = `/courses/${courseId}/manage/requests`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Student requests</h2>
          <p className="text-sm text-muted-foreground">
            Students ask here when they can&apos;t change a booking themselves or have a question about their marks. Open the student to move them or
            grant an exception, then reply.
          </p>
        </div>
        <div className="flex rounded-lg border p-0.5 text-sm">
          <Link href={base} className={`rounded-md px-2.5 py-1 ${!closed ? "bg-muted font-medium" : "text-muted-foreground"}`}>
            Open
          </Link>
          <Link href={`${base}?show=closed`} className={`rounded-md px-2.5 py-1 ${closed ? "bg-muted font-medium" : "text-muted-foreground"}`}>
            Answered
          </Link>
        </div>
      </div>

      {requests.length === 0 ? (
        <EmptyState title={closed ? "No answered requests yet" : "No open requests"}>{closed ? null : "You're all caught up."}</EmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {requests.map((r) => (
            <Card key={r.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle>{r.student.name}</CardTitle>
                    <CardDescription>
                      {KIND[r.kind]} · {r.assignment.title} · {fmt(r.createdAt, tz, "d MMM, HH:mm")}
                    </CardDescription>
                  </div>
                  {closed && <StatusBadge status={r.status} label={r.status === "RESOLVED" ? "Handled" : "Declined"} tone={r.status === "RESOLVED" ? "success" : "neutral"} />}
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="whitespace-pre-line">{r.message}</p>
                {r.booking && (
                  <p className="text-muted-foreground">
                    Current booking: {fmtRange(r.booking.slot.startsAt, r.booking.slot.endsAt, tz)} with {r.booking.slot.ta.name} (
                    {r.booking.status.toLowerCase().replace("_", "-")})
                  </p>
                )}
                {r.response && (
                  <p className="text-muted-foreground">
                    <span className="font-medium">{r.resolvedBy?.name ?? "Staff"}:</span> {r.response}
                  </p>
                )}
                <Link className="inline-block text-primary underline" href={`/courses/${courseId}/manage/assignments/${r.assignment.id}/evaluate/${r.student.id}?returnTo=${encodeURIComponent(base)}`}>
                  {r.kind === "MARK_QUERY" ? "Open marks" : "Open booking & exceptions"}
                </Link>
                {!closed && (
                  <ActionForm action={resolveRequestAction} className="space-y-2">
                    <input type="hidden" name="requestId" value={r.id} />
                    <Textarea name="response" rows={2} placeholder="Reply to the student (required when declining)" aria-label={`Reply to ${r.student.name}`} />
                    <div className="flex gap-2">
                      <SubmitButton size="sm" name="decision" value="RESOLVED">
                        Mark handled
                      </SubmitButton>
                      <SubmitButton size="sm" variant="outline" name="decision" value="DECLINED">
                        Decline
                      </SubmitButton>
                    </div>
                  </ActionForm>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
