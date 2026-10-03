import Link from "next/link";
import { format } from "date-fns";
import { EmptyState } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requireAdminUser } from "@/server/auth/session";
import { adminAuditLog } from "@/server/services/admin";
import { AUDIT_AREAS, AuditSentence } from "../audit-text";
import { FilterTabs, query } from "../filter-tabs";

export const metadata = { title: "Audit log" };

export default async function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const area = AUDIT_AREAS.find(([v]) => v === sp.area)?.[0];
  const before = typeof sp.before === "string" && !Number.isNaN(Date.parse(sp.before)) ? sp.before : undefined;
  const user = await requireAdminUser();
  const { entries, nextBefore } = await adminAuditLog(user, { q, area, before });

  return (
    <div className="space-y-4">
      <form className="flex max-w-md gap-2" role="search">
        <Input name="q" type="search" placeholder="Who did it (name or email)" aria-label="Filter by person" defaultValue={q} />
        {area && <input type="hidden" name="area" value={area} />}
      </form>
      <FilterTabs label="Area" current={area ?? "all"} options={[["all", "Everything"], ...AUDIT_AREAS]} hrefFor={(v) => query("/admin/audit", { q, area: v === "all" ? undefined : v })} />

      {entries.length === 0 ? (
        <EmptyState title="No matching activity" />
      ) : (
        <Card className="p-0">
          <ul className="divide-y text-sm">
            {entries.map((e) => (
              <li key={e.id} className="flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-baseline sm:gap-4">
                <time dateTime={e.createdAt.toISOString()} className="w-36 shrink-0 text-xs tabular-nums text-muted-foreground">
                  {format(e.createdAt, "d MMM yyyy, HH:mm")}
                </time>
                <div className="min-w-0 flex-1">
                  <AuditSentence entry={e} />
                  {e.after != null && (
                    <details className="mt-0.5">
                      <summary className="cursor-pointer text-xs text-muted-foreground">Details</summary>
                      <pre className="mt-1 overflow-x-auto rounded bg-muted p-2 text-xs">{JSON.stringify({ before: e.before ?? undefined, after: e.after }, null, 2)}</pre>
                    </details>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <div className="flex gap-3 text-sm">
        {before && (
          <Link className="underline" href={query("/admin/audit", { q, area })}>
            Newest
          </Link>
        )}
        {nextBefore && (
          <Link className="underline" href={query("/admin/audit", { q, area, before: nextBefore })}>
            Older entries
          </Link>
        )}
      </div>
    </div>
  );
}
