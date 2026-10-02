import { format, formatDistanceToNowStrict } from "date-fns";
import { retryEmailsAction } from "@/app/actions/admin";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { EmptyState } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAdminUser } from "@/server/auth/session";
import { adminEmailQueue } from "@/server/services/admin";
import { FilterTabs } from "../filter-tabs";

export const metadata = { title: "Email delivery" };

const TABS = ["FAILED", "PENDING", "SENT"] as const;

export default async function AdminEmailPage({ searchParams }: PageProps<"/admin/email">) {
  const sp = await searchParams;
  const status = TABS.find((t) => t === sp.status) ?? "FAILED";
  const user = await requireAdminUser();
  const { rows, counts } = await adminEmailQueue(user, status);
  const options = [
    ["FAILED", `Failed (${counts.FAILED ?? 0})`],
    ["PENDING", `Waiting (${counts.PENDING ?? 0})`],
    ["SENT", "Sent"],
  ] as const;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Every invite, reminder and notice goes through this queue. The worker sends each one and retries up to 5 times. After that, it lands here as failed.
      </p>
      <FilterTabs label="Email status" current={status} options={options} hrefFor={(v) => (v === "FAILED" ? "/admin/email" : `/admin/email?status=${v}`)} />

      {status === "FAILED" && rows.length > 0 && (
        <ActionForm action={retryEmailsAction} compact confirm={`Queue all ${counts.FAILED} failed emails again? Fix the cause first (usually SMTP settings or a wrong address).`} confirmLabel="Retry all">
          <SubmitButton size="sm">Retry all failed</SubmitButton>
        </ActionForm>
      )}

      {rows.length === 0 ? (
        <EmptyState title={status === "FAILED" ? "No failed emails" : status === "PENDING" ? "Nothing waiting to be sent" : "No emails sent yet"} />
      ) : (
        <Card className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>To / subject</TableHead>
                <TableHead className="hidden md:table-cell">{status === "SENT" ? "Sent" : status === "PENDING" ? "Queued" : "Error"}</TableHead>
                {status === "FAILED" && <TableHead className="w-20" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="max-w-xs">
                    <p className="truncate font-medium">{e.to}</p>
                    <p className="truncate text-xs text-muted-foreground">{e.subject}</p>
                    {status === "FAILED" && <p className="truncate text-xs text-destructive md:hidden">{e.lastError}</p>}
                  </TableCell>
                  <TableCell className="hidden max-w-md text-xs md:table-cell">
                    {status === "SENT" && e.sentAt && format(e.sentAt, "d MMM, HH:mm")}
                    {status === "PENDING" && (
                      <>
                        {formatDistanceToNowStrict(e.createdAt, { addSuffix: true })}
                        {e.attempts > 0 && ` · ${e.attempts} attempt${e.attempts === 1 ? "" : "s"}, next ${format(e.sendAfter, "HH:mm")}`}
                      </>
                    )}
                    {status === "FAILED" && (
                      <span className="line-clamp-2 text-destructive" title={e.lastError ?? undefined}>
                        {e.lastError ?? "Unknown error"}
                      </span>
                    )}
                  </TableCell>
                  {status === "FAILED" && (
                    <TableCell>
                      <ActionForm action={retryEmailsAction} compact>
                        <input type="hidden" name="emailId" value={e.id} />
                        <SubmitButton size="xs" variant="outline">
                          Retry
                        </SubmitButton>
                      </ActionForm>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
