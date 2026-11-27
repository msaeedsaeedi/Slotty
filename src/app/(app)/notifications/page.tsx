import { markAllReadAction } from "@/app/actions/admin";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { EmptyState, PageHeader } from "@/components/page-header";
import { NotificationLink } from "@/components/notification-link";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { requireUser } from "@/server/auth/session";
import { groupByAssignment, listNotifications } from "@/server/services/inbox";
import { needsAction } from "@/domain/notifications";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const user = await requireUser();
  const items = await listNotifications(user);
  const unread = items.filter((n) => !n.readAt).length;
  const groups = await groupByAssignment(items);
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
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.key} aria-label={g.label} className="space-y-2">
              <h2 className="text-sm font-medium text-muted-foreground">{g.label}</h2>
              <Card className="divide-y p-0">
                {g.items.map((n) => {
                  const body = (
                    <div className={cn("flex gap-3 p-4", !n.readAt && "bg-primary/5")}>
                      <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : needsAction(n.type) ? "bg-blue-600" : "bg-muted-foreground/40")} aria-hidden />
                      {!n.readAt && <span className="sr-only">Unread:</span>}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="font-medium">{n.title}</p>
                          <span className="text-xs text-muted-foreground">{formatDistanceToNow(n.createdAt, { addSuffix: true })}</span>
                        </div>
                        <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{n.body}</p>
                      </div>
                    </div>
                  );
                  // Marks the item read on the way (online), or goes straight to the page offline (#174).
                  return n.link ? (
                    <NotificationLink key={n.id} id={n.id} target={n.link} className="block hover:bg-muted/50">
                      {body}
                    </NotificationLink>
                  ) : (
                    <div key={n.id}>{body}</div>
                  );
                })}
              </Card>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
