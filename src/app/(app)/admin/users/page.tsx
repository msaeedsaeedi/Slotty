import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { EmptyState } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAdminUser } from "@/server/auth/session";
import { adminListUsers, STALE_INVITE_DAYS, type UserFilter } from "@/server/services/admin";
import { FilterTabs, query } from "../filter-tabs";

export const metadata = { title: "Users" };

const FILTERS = [
  ["all", "Everyone"],
  ["active", "Active"],
  ["invited", "Awaiting activation"],
  ["stale", `Invite > ${STALE_INVITE_DAYS} days`],
  ["disabled", "Disabled"],
  ["admins", "Admins"],
  ["no-courses", "Not in any course"],
] as const;

export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const filter = (FILTERS.find(([v]) => v === sp.filter)?.[0] ?? "all") as UserFilter;
  const user = await requireAdminUser();
  const { users, total } = await adminListUsers(user, { q, filter });

  return (
    <div className="space-y-4">
      <form className="flex max-w-md gap-2" role="search">
        <Input name="q" type="search" placeholder="Search name or email" aria-label="Search users" defaultValue={q} />
        {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
      </form>
      <FilterTabs label="Filter users" current={filter} options={FILTERS} hrefFor={(v) => query("/admin/users", { q, filter: v === "all" ? undefined : v })} />
      <p className="text-sm text-muted-foreground">
        {total} user{total === 1 ? "" : "s"}
        {total > users.length && ` · showing the newest ${users.length}`}
      </p>

      {users.length === 0 ? (
        <EmptyState title="No users match">Try another filter or search.</EmptyState>
      ) : (
        <Card className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden sm:table-cell">Roles</TableHead>
                <TableHead className="hidden md:table-cell">Joined</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id} className="relative">
                  <TableCell>
                    <Link href={`/admin/users/${u.id}`} className="font-medium after:absolute after:inset-0 hover:underline">
                      {u.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={u.status} />
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {u.isAdmin && <StatusBadge status="ADMIN" label="Admin" tone="info" />}
                      {u.teaches && <StatusBadge status="TA" label="Staff" tone="info" />}
                      {u.studies && <StatusBadge status="STUDENT" label="Student" />}
                      {!u.isAdmin && u.courses === 0 && <span className="text-xs text-muted-foreground">No courses</span>}
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground md:table-cell">{u.createdAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</TableCell>
                  <TableCell>
                    <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
