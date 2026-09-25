import { createRequestAction } from "@/app/actions/bookings";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { StatusBadge } from "@/components/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { fmt } from "@/lib/time";

export interface RequestRow {
  id: string;
  kind: "BOOKING_CHANGE" | "MARK_QUERY";
  status: "OPEN" | "RESOLVED" | "DECLINED";
  message: string;
  response: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  resolvedBy: { name: string } | null;
}

/** A staff reply stays expanded for a while so the student sees it without hunting. */
const SHOW_REPLY_MS = 7 * 86_400_000;

const STATUS = { OPEN: ["Waiting for staff", "warning"], RESOLVED: ["Handled", "success"], DECLINED: ["Declined", "neutral"] } as const;

/**
 * "Ask course staff" — the escape hatch whenever self-service is blocked. Shows
 * this kind's past requests and, if none is open, a form to send a new one.
 */
export function RequestPanel({
  assignmentId,
  kind,
  requests,
  title,
  hint,
  open,
  timezone,
}: {
  assignmentId: string;
  kind: RequestRow["kind"];
  requests: RequestRow[];
  title: string;
  hint: string;
  /** Expanded by default (e.g. the student is stuck). */
  open?: boolean;
  timezone: string;
}) {
  const mine = requests.filter((r) => r.kind === kind);
  const pending = mine.some((r) => r.status === "OPEN");
  const now = Date.now();
  const recentReply = mine.some((r) => r.resolvedAt && now - r.resolvedAt.getTime() < SHOW_REPLY_MS);
  return (
    <details className="group rounded-lg border bg-card p-3 text-sm" open={open || pending || recentReply || undefined}>
      <summary className="cursor-pointer font-medium">{title}</summary>
      <div className="mt-3 space-y-3">
        {mine.map((r) => (
          <div key={r.id} className="space-y-1 rounded-md bg-muted/50 p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Sent {fmt(r.createdAt, timezone, "d MMM, HH:mm")}</span>
              <StatusBadge status={r.status} label={STATUS[r.status][0]} tone={STATUS[r.status][1]} />
            </div>
            <p className="whitespace-pre-line">{r.message}</p>
            {r.response && (
              <p className="whitespace-pre-line text-muted-foreground">
                <span className="font-medium">{r.resolvedBy?.name ?? "Staff"}:</span> {r.response}
              </p>
            )}
          </div>
        ))}
        {!pending && (
          <ActionForm action={createRequestAction} resetOnSuccess className="space-y-2">
            <input type="hidden" name="assignmentId" value={assignmentId} />
            <input type="hidden" name="kind" value={kind} />
            <p className="text-muted-foreground">{hint}</p>
            <Textarea name="message" required minLength={5} maxLength={2000} rows={3} aria-label={title} />
            <SubmitButton size="sm" variant="outline">
              Send to course staff
            </SubmitButton>
          </ActionForm>
        )}
      </div>
    </details>
  );
}
