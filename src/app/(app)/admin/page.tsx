import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdminUser } from "@/server/auth/session";
import { adminOverview, STALE_INVITE_DAYS } from "@/server/services/admin";
import { AuditSentence } from "./audit-text";

export const metadata = { title: "Admin overview" };

/** Emails waiting longer than this suggest the worker isn't running. */
const QUEUE_STUCK_MS = 15 * 60_000;

export default async function AdminOverviewPage() {
  const user = await requireAdminUser();
  const now = new Date();
  const o = await adminOverview(user, now);
  const queueStuck = o.email.oldestPendingAt && now.getTime() - o.email.oldestPendingAt.getTime() > QUEUE_STUCK_MS;

  const attention: { key: string; title: React.ReactNode; detail: React.ReactNode; href: string; action: string }[] = [];
  if (queueStuck) {
    attention.push({
      key: "queue",
      title: `${o.email.pending} email${o.email.pending === 1 ? " is" : "s are"} stuck in the queue`,
      detail: `The oldest has waited ${formatDistanceToNowStrict(o.email.oldestPendingAt!)}. Check that the worker is running and SMTP is reachable.`,
      href: "/admin/email?status=PENDING",
      action: "View queue",
    });
  }
  if (o.email.failed30d > 0) {
    attention.push({
      key: "failed",
      title: `${o.email.failed30d} email${o.email.failed30d === 1 ? "" : "s"} failed to send`,
      detail: "These people didn't get an invite, reminder or notice. Fix the cause, then retry.",
      href: "/admin/email",
      action: "Review",
    });
  }
  if (o.courses.withoutStaff.length > 0) {
    attention.push({
      key: "staff",
      title: `${o.courses.withoutStaff.length} active course${o.courses.withoutStaff.length === 1 ? " has" : "s have"} no instructor or TA`,
      detail: o.courses.withoutStaff.map((c) => c.code).join(", ") + " — nobody can run demos or answer students.",
      href: "/admin/courses?filter=no-staff",
      action: "Assign staff",
    });
  }
  if (o.staleInvites.count > 0) {
    attention.push({
      key: "invites",
      title: `${o.staleInvites.count} invite${o.staleInvites.count === 1 ? "" : "s"} not accepted after ${STALE_INVITE_DAYS} days`,
      detail: o.staleInvites.oldest.map((u) => u.email).join(", ") + (o.staleInvites.count > o.staleInvites.oldest.length ? ", …" : ""),
      href: "/admin/users?filter=stale",
      action: "Follow up",
    });
  }

  const stats = [
    { label: "Active users", value: o.users.active, href: "/admin/users?filter=active", sub: `${o.users.newThisWeek} new this week` },
    { label: "Awaiting activation", value: o.users.invited, href: "/admin/users?filter=invited", sub: `${o.staleInvites.count} older than ${STALE_INVITE_DAYS} days` },
    { label: "Active courses", value: o.courses.active, href: "/admin/courses", sub: `${o.courses.archived} archived` },
    { label: "Demos next 7 days", value: o.demosNext7d, href: "/admin/courses", sub: "booked across all courses" },
    { label: "Emails sent (30 days)", value: o.email.sent30d, href: "/admin/email?status=SENT", sub: `${o.email.pending} waiting · ${o.email.failed30d} failed` },
    { label: "Disabled accounts", value: o.users.disabled, href: "/admin/users?filter=disabled", sub: `${o.users.admins} admin${o.users.admins === 1 ? "" : "s"}` },
  ];

  return (
    <div className="space-y-6">
      <section aria-labelledby="attention" className="space-y-3">
        <h2 id="attention" className="text-sm font-semibold">
          Needs attention
        </h2>
        {attention.length === 0 ? (
          <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
            <CheckCircle2 className="size-4" aria-hidden /> All clear: email is flowing, every course has staff, and no invites are stuck.
          </div>
        ) : (
          <ul className="space-y-2">
            {attention.map((a) => (
              <li key={a.key}>
                <Card className="flex-row items-start gap-3 p-4 text-sm">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{a.title}</p>
                    <p className="truncate text-muted-foreground">{a.detail}</p>
                  </div>
                  <Link href={a.href} className="shrink-0 font-medium text-primary underline underline-offset-2">
                    {a.action}
                  </Link>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Platform numbers" className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {stats.map((s) => (
          <Link key={s.label} href={s.href}>
            <Card className="h-full gap-1 p-4 transition-colors hover:border-primary/40">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="text-2xl font-semibold tabular-nums">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.sub}</p>
            </Card>
          </Link>
        ))}
      </section>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">Recent activity</CardTitle>
            <Link href="/admin/audit" className="text-sm text-primary underline underline-offset-2">
              Full audit log
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {o.recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
          ) : (
            <ul className="divide-y text-sm">
              {o.recent.map((e) => (
                <li key={e.id} className="flex items-baseline justify-between gap-3 py-2">
                  <AuditSentence entry={e} />
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDistanceToNowStrict(e.createdAt, { addSuffix: true })}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
