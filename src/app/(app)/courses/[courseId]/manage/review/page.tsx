import Link from "next/link";
import { finalizeManyAction, reviewAction } from "@/app/actions/evaluations";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { EmptyState } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requireUser } from "@/server/auth/session";
import { load } from "@/server/page-utils";
import { listReviewQueue } from "@/server/services/evaluations";

export const metadata = { title: "Review" };

export default async function ReviewPage({ params }: PageProps<"/courses/[courseId]/manage/review">) {
  const { courseId } = await params;
  const user = await requireUser();
  const queue = await load(listReviewQueue(user, courseId));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Awaiting your review</h2>
          <p className="text-sm text-muted-foreground">
            Evaluations TAs have submitted. Finalizing releases marks to the student; returning sends it back to the TA with your comment.
          </p>
        </div>
        {queue.length > 1 && (
          <ActionForm action={finalizeManyAction} compact confirm={`Finalize all ${queue.length} evaluations? Every student will see their marks.`}>
            {queue.map((e) => (
              <input key={e.id} type="hidden" name="evaluationId" value={e.id} />
            ))}
            <SubmitButton size="sm">Finalize all {queue.length}</SubmitButton>
          </ActionForm>
        )}
      </div>
      {queue.length === 0 ? (
        <EmptyState title="Nothing to review">You&apos;re all caught up.</EmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {queue.map((e) => {
            const scoreBy = new Map(e.scores.map((s) => [s.criterionId, s.points]));
            return (
              <Card key={e.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle>{e.student.name}</CardTitle>
                      <CardDescription>
                        {e.assignment.title} · marked by {e.evaluator.name}
                      </CardDescription>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-semibold tabular-nums">
                        {e.totalMarks}
                        <span className="text-sm font-normal text-muted-foreground">/{e.assignment.maxMarks}</span>
                      </p>
                      {e.booking && <StatusBadge status={e.booking.status} />}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {e.assignment.criteria.length > 0 && (
                    <ul className="divide-y rounded-lg border">
                      {e.assignment.criteria.map((c) => (
                        <li key={c.id} className="flex justify-between p-2">
                          <span>{c.label}</span>
                          <span className="tabular-nums">
                            {scoreBy.get(c.id) ?? "–"}/{c.maxPoints}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {e.totalOverride && <p className="text-amber-700 dark:text-amber-400">Total overridden: {e.overrideNote}</p>}
                  {e.feedback && (
                    <p>
                      <span className="font-medium">Feedback:</span> {e.feedback}
                    </p>
                  )}
                  {e.privateNotes && (
                    <p className="text-muted-foreground">
                      <span className="font-medium">Private notes:</span> {e.privateNotes}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <ActionForm action={reviewAction} compact>
                      <input type="hidden" name="evaluationId" value={e.id} />
                      <input type="hidden" name="decision" value="finalize" />
                      <SubmitButton size="sm">Finalize</SubmitButton>
                    </ActionForm>
                    <ActionForm action={reviewAction} compact className="flex flex-1 gap-2">
                      <input type="hidden" name="evaluationId" value={e.id} />
                      <input type="hidden" name="decision" value="return" />
                      <Input name="comment" placeholder="Comment for the TA" className="h-7 min-w-0 flex-1" />
                      <SubmitButton size="sm" variant="outline">
                        Return
                      </SubmitButton>
                    </ActionForm>
                    <Link href={`/courses/${courseId}/manage/assignments/${e.assignmentId}/evaluate/${e.studentId}`} className="text-xs underline">
                      Open
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
