import Link from "next/link";

/** Plain-language verbs for audit actions; unknown actions fall back to the raw code. */
const VERBS: Record<string, string> = {
  "user.disable": "disabled",
  "user.enable": "re-enabled",
  "user.grant_admin": "made admin",
  "user.revoke_admin": "removed admin from",
  "user.invite_resent": "re-sent the invite to",
  "user.reset_sent": "sent a password reset to",
  "user.update": "edited",
  "course.create": "created course",
  "course.update": "edited course",
  "course.archive": "archived",
  "course.unarchive": "restored",
  "course.assign_staff": "assigned staff to",
  "roster.import": "imported a roster into",
  "email.retry": "retried failed emails",
  "enrollment.remove": "removed someone from",
  "assignment.create": "created an assignment",
  "assignment.update": "edited an assignment",
  "assignment.publish": "published an assignment",
  "assignment.close": "closed an assignment",
  "assignment.auto_close": "auto-closed an assignment",
  "assignment.delete": "deleted an assignment",
  "availability.add": "added availability",
  "booking.attendance": "recorded attendance",
  "booking.staff_cancel": "cancelled a booking",
  "booking.staff_place": "placed a student",
  "booking.allowance": "granted a booking exception",
  "booking.no_show_released": "cleared a no-show",
  "slot.cancel": "cancelled a slot",
  "slot.capacity": "changed slot capacity",
  "slot.host": "changed a slot's host",
  "slot.venue": "changed a slot's venue",
  "evaluation.submit": "submitted marks",
  "evaluation.finalize": "finalized marks",
  "evaluation.return": "returned marks",
  "evaluation.unlock": "unlocked marks",
  "request.resolved": "handled a request",
  "request.declined": "declined a request",
};

export const AUDIT_AREAS = [
  ["user", "Users"],
  ["course", "Courses"],
  ["roster", "Rosters"],
  ["assignment", "Assignments"],
  ["slot", "Slots"],
  ["booking", "Bookings"],
  ["evaluation", "Marks"],
  ["request", "Requests"],
  ["email", "Email"],
] as const;

export function entityHref(entityType: string, entityId: string) {
  if (entityType === "User") return `/admin/users/${entityId}`;
  if (entityType === "Course") return `/courses/${entityId}/manage`;
  return null;
}

/** "Tariq TA disabled Ann Lee" */
export function AuditSentence({
  entry,
}: {
  entry: { action: string; entityType: string; entityId: string; entityName?: string | null; actor: { name: string } | null };
}) {
  const verb = VERBS[entry.action];
  const href = entityHref(entry.entityType, entry.entityId);
  // Verbs like "recorded attendance" already name the object; only users and courses get a target.
  const named = entry.entityType === "User" || entry.entityType === "Course";
  const target = named ? (entry.entityName ?? "(deleted)") : verb ? "" : `${entry.entityType} ${entry.entityId.slice(0, 8)}`;
  return (
    <span>
      <span className="font-medium">{entry.actor?.name ?? "System"}</span> {verb ?? <code className="text-xs">{entry.action}</code>}{" "}
      {target && (href ? (
        <Link className="underline underline-offset-2" href={href}>
          {target}
        </Link>
      ) : (
        <span className="text-muted-foreground">{target}</span>
      ))}
    </span>
  );
}
