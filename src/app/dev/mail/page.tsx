import { notFound } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { db } from "@/server/db";

export const metadata = { title: "Dev mailbox" };

/** Development only: every queued email, so invites and reminders can be followed without SMTP. */
export default async function DevMailPage({ searchParams }: PageProps<"/dev/mail">) {
  if (process.env.NODE_ENV === "production") notFound();
  const { to } = await searchParams;
  const emails = await db.emailOutbox.findMany({
    where: typeof to === "string" && to ? { to: { contains: to } } : {},
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <PageHeader title="Dev mailbox" description="Emails queued by the app (development only). Links inside work locally." />
      <div className="space-y-3">
        {emails.map((e) => (
          <Card key={e.id} className="gap-2 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="font-medium">{e.subject}</span>
              <span className="text-xs text-muted-foreground">
                to {e.to} · {formatDistanceToNow(e.createdAt, { addSuffix: true })} <StatusBadge status={e.status} label={e.status.toLowerCase()} />
              </span>
            </div>
            <pre className="whitespace-pre-wrap break-words font-sans text-sm text-muted-foreground">
              {e.text.split(/(https?:\/\/\S+)/g).map((part, i) =>
                /^https?:\/\//.test(part) ? (
                  <a key={i} href={part} className="text-primary underline">
                    {part}
                  </a>
                ) : (
                  part
                ),
              )}
            </pre>
          </Card>
        ))}
      </div>
    </main>
  );
}
