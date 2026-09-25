import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { requireAdminUser } from "@/server/auth/session";
import { adminAuditLog } from "@/server/services/admin";

export const metadata = { title: "Audit log" };

export default async function AuditPage() {
  const user = await requireAdminUser();
  const entries = await adminAuditLog(user);
  return (
    <Card className="p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When (UTC)</TableHead>
            <TableHead>Who</TableHead>
            <TableHead>Action</TableHead>
            <TableHead className="hidden md:table-cell">Details</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((e) => (
            <TableRow key={e.id}>
              <TableCell className="whitespace-nowrap text-xs tabular-nums">{format(e.createdAt, "yyyy-MM-dd HH:mm:ss")}</TableCell>
              <TableCell>{e.actor?.name ?? "system"}</TableCell>
              <TableCell>
                <code className="text-xs">{e.action}</code>
                <p className="text-xs text-muted-foreground">
                  {e.entityType} {e.entityId.slice(0, 12)}
                </p>
              </TableCell>
              <TableCell className="hidden max-w-md truncate font-mono text-xs text-muted-foreground md:table-cell">
                {e.after ? JSON.stringify(e.after) : ""}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
