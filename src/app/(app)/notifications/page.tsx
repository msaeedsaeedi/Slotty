import Link from "next/link";
import { markAllReadAction } from "@/app/actions/admin";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { requireUser } from "@/server/auth/session";
import { listNotifications } from "@/server/services/inbox";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const user = await requireUser();
  const items = await listNotifications(user);
  const unread = items.filter((n) => !n.readAt).length;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Notifications"
        description={unread ? `${unread} unread` : "You're all caught up."}
        actions={
          unread > 0 && (
            <ActionForm action={markAllReadAction} compact>
              <SubmitButton variant="outline" size="sm">
                Mark all read
              </SubmitButton>
            </ActionForm>
          )
        }
      />
      {items.length === 0 ? (
        <EmptyState title="No notifications yet" />
      ) : (
        <Card className="divide-y p-0">
          {items.map((n) => {
            const body = (
              <div className={cn("flex gap-3 p-4", !n.readAt && "bg-primary/5")}>
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-blue-600")} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium">{n.title}</p>
                    <span className="text-xs text-muted-foreground">{formatDistanceToNow(n.createdAt, { addSuffix: true })}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{n.body}</p>
                </div>
              </div>
            );
            return n.link ? (
              <Link key={n.id} href={n.link} className="block hover:bg-muted/50">
                {body}
              </Link>
            ) : (
              <div key={n.id}>{body}</div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
