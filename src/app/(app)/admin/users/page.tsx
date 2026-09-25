import { setAdminAction, setDisabledAction } from "@/app/actions/admin";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAdminUser } from "@/server/auth/session";
import { adminListUsers } from "@/server/services/admin";

export const metadata = { title: "Users" };

export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  const { q } = await searchParams;
  const user = await requireAdminUser();
  const users = await adminListUsers(user, typeof q === "string" ? q : undefined);
  return (
    <div className="space-y-4">
      <form className="max-w-sm">
        <Input name="q" placeholder="Search name or email" defaultValue={typeof q === "string" ? q : ""} />
      </form>
      <Card className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden sm:table-cell">Courses</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <p className="font-medium">
                    {u.name} {u.isAdmin && <StatusBadge status="ADMIN" label="Admin" tone="info" />}
                  </p>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                </TableCell>
                <TableCell>
                  <StatusBadge status={u.status} />
                </TableCell>
                <TableCell className="hidden sm:table-cell">{u._count.enrollments}</TableCell>
                <TableCell>
                  {u.id !== user.id && (
                    <div className="flex justify-end gap-1">
                      <ActionForm action={setAdminAction} compact confirm={u.isAdmin ? `Remove admin from ${u.name}?` : `Make ${u.name} an admin?`}>
                        <input type="hidden" name="userId" value={u.id} />
                        <input type="hidden" name="isAdmin" value={u.isAdmin ? "false" : "true"} />
                        <SubmitButton size="xs" variant="ghost">
                          {u.isAdmin ? "Revoke admin" : "Make admin"}
                        </SubmitButton>
                      </ActionForm>
                      <ActionForm action={setDisabledAction} compact confirm={u.status === "DISABLED" ? undefined : `Disable ${u.name}? They'll be signed out.`}>
                        <input type="hidden" name="userId" value={u.id} />
                        <input type="hidden" name="disabled" value={u.status === "DISABLED" ? "false" : "true"} />
                        <SubmitButton size="xs" variant="ghost" className={u.status === "DISABLED" ? "" : "text-destructive"}>
                          {u.status === "DISABLED" ? "Enable" : "Disable"}
                        </SubmitButton>
                      </ActionForm>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
