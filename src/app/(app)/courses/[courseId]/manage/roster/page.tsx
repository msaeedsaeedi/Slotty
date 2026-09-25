import { removeMemberAction, resendInviteAction } from "@/app/actions/courses";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireUser } from "@/server/auth/session";
import { load } from "@/server/page-utils";
import { listMembers } from "@/server/services/courses";
import { RosterImport } from "./roster-import";

export const metadata = { title: "People" };

export default async function RosterPage({ params }: PageProps<"/courses/[courseId]/manage/roster">) {
  const { courseId } = await params;
  const user = await requireUser();
  const members = await load(listMembers(user, courseId));
  const counts = { STUDENT: 0, TA: 0, INSTRUCTOR: 0 };
  for (const m of members) counts[m.role]++;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <Card className="p-0">
        <CardHeader className="pt-4">
          <CardTitle>People</CardTitle>
          <CardDescription>
            {counts.STUDENT} students · {counts.TA} TAs · {counts.INSTRUCTOR} instructors
          </CardDescription>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="hidden sm:table-cell">Account</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => (
              <TableRow key={m.id}>
                <TableCell>
                  <p className="font-medium">{m.user.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {m.user.email}
                    {m.section && ` · §${m.section}`}
                  </p>
                </TableCell>
                <TableCell>
                  <StatusBadge status={m.role} />
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <StatusBadge status={m.user.status} />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {m.user.status === "INVITED" && (
                      <ActionForm action={resendInviteAction} compact>
                        <input type="hidden" name="courseId" value={courseId} />
                        <input type="hidden" name="userId" value={m.userId} />
                        <SubmitButton variant="ghost" size="xs">
                          Resend invite
                        </SubmitButton>
                      </ActionForm>
                    )}
                    {m.userId !== user.id && (
                      <ActionForm action={removeMemberAction} compact confirm={`Remove ${m.user.name} from this course?`}>
                        <input type="hidden" name="courseId" value={courseId} />
                        <input type="hidden" name="userId" value={m.userId} />
                        <SubmitButton variant="ghost" size="xs" className="text-destructive">
                          Remove
                        </SubmitButton>
                      </ActionForm>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <Card className="h-fit">
        <CardHeader>
          <CardTitle>Import class list</CardTitle>
          <CardDescription>Add students and staff by email from a CSV. Re-import any time — existing people are kept.</CardDescription>
        </CardHeader>
        <CardContent>
          <RosterImport courseId={courseId} />
        </CardContent>
      </Card>
    </div>
  );
}
