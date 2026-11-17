import Link from "next/link";
import { format } from "date-fns";
import { setFeedbackStatusAction } from "@/app/actions/feedback";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { EmptyState } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import type { FeedbackStatus } from "@/generated/prisma/client";
import { requireAdminUser } from "@/server/auth/session";
import { FEEDBACK_STATUSES, listFeedback } from "@/server/services/feedback";
import { FilterTabs, query } from "../filter-tabs";

export const metadata = { title: "Feedback" };

const LABEL: Record<FeedbackStatus, string> = { NEW: "New", TRIAGED: "Triaged", DONE: "Done" };
const NEXT: Record<FeedbackStatus, FeedbackStatus[]> = { NEW: ["TRIAGED", "DONE"], TRIAGED: ["DONE", "NEW"], DONE: ["NEW"] };

/** Anonymous feedback from the in-app button. Triaged = read and noted somewhere (a roadmap item, an issue). */
export default async function FeedbackPage({ searchParams }: PageProps<"/admin/feedback">) {
  const sp = await searchParams;
  const status: FeedbackStatus | undefined = sp.status === "all" ? undefined : (FEEDBACK_STATUSES.find((s) => s === sp.status) ?? "NEW");
  const page = Math.max(0, Number(typeof sp.page === "string" ? sp.page : 0) || 0);
  const user = await requireAdminUser();
  const { items, more, counts } = await listFeedback(user, { status, page });
  const statusParam = status ?? "all";
  const href = (p: { status?: string; page?: number }) =>
    query("/admin/feedback", { status: (p.status ?? statusParam) === "NEW" ? undefined : (p.status ?? statusParam), page: p.page ? String(p.page) : undefined });

  return (
    <div className="space-y-4">
      <FilterTabs
        label="Status"
        current={statusParam}
        options={[...FEEDBACK_STATUSES.map((s) => [s, `${LABEL[s]} (${counts[s]})`] as const), ["all", "All"] as const]}
        hrefFor={(v) => href({ status: v })}
      />
      {items.length === 0 ? (
        <EmptyState title={status === "NEW" ? "No new feedback" : "Nothing here"}>Feedback is anonymous: it shows the role, page and release only.</EmptyState>
      ) : (
        <Card className="p-0">
          <ul className="divide-y text-sm">
            {items.map((f) => (
              <li key={f.id} className="space-y-2 px-4 py-3">
                <p className="whitespace-pre-wrap break-words">{f.message}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>{format(f.createdAt, "d MMM yyyy, HH:00")}</span>
                  <span>{f.role}</span>
                  <span className="font-mono">{f.path}</span>
                  {f.rating != null && <span>rated {f.rating}/5</span>}
                  <span>version {f.version}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5">{LABEL[f.status]}</span>
                  <span className="ml-auto flex gap-1">
                    {NEXT[f.status].map((s) => (
                      <ActionForm key={s} action={setFeedbackStatusAction} compact>
                        <input type="hidden" name="feedbackId" value={f.id} />
                        <input type="hidden" name="status" value={s} />
                        <SubmitButton size="sm" variant="outline" className="h-7 text-xs">
                          {s === "NEW" ? "Reopen" : `Mark ${LABEL[s].toLowerCase()}`}
                        </SubmitButton>
                      </ActionForm>
                    ))}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <div className="flex gap-3 text-sm">
        {page > 0 && (
          <Link className="underline" href={href({ page: page - 1 })}>
            Newer
          </Link>
        )}
        {more && (
          <Link className="underline" href={href({ page: page + 1 })}>
            Older
          </Link>
        )}
      </div>
    </div>
  );
}
