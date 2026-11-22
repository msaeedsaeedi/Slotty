import Link from "next/link";
import { adminWithdrawMarksAction } from "@/app/actions/admin";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { EmptyState } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RELEASE_HOLD_HOURS } from "@/domain/evaluation";
import { REASON_MAX_LENGTH } from "@/domain/text";
import { fmt } from "@/lib/time";
import { requireAdminUser } from "@/server/auth/session";
import { adminListHeldMarks } from "@/server/services/evaluations";

export const metadata = { title: "Held marks" };

/** Marks TAs released in courses without an instructor, waiting out their hold (ADR-032). */
export default async function AdminHeldMarksPage() {
  const user = await requireAdminUser();
  const rows = await adminListHeldMarks(user);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        In a course without an instructor, marks a TA releases reach students {RELEASE_HOLD_HOURS} hours later. Until then the TA, or you, can withdraw them. Withdrawing sends them back to the
        TA as a draft and tells them your reason.
      </p>
      {rows.length === 0 ? (
        <EmptyState title="No marks waiting to be released" />
      ) : (
        <Card className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student / assignment</TableHead>
                <TableHead className="hidden md:table-cell">Released by</TableHead>
                <TableHead>Reaches the student</TableHead>
                <TableHead className="w-72" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="max-w-xs">
                    <p className="truncate font-medium">{e.student.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      <Link href={`/courses/${e.assignment.course.id}`} className="underline underline-offset-2">
                        {e.assignment.course.code}
                      </Link>{" "}
                      · {e.assignment.title} · {e.totalMarks ?? "–"}/{e.assignment.maxMarks}
                    </p>
                  </TableCell>
                  <TableCell className="hidden text-sm md:table-cell">{e.submittedBy?.name ?? "–"}</TableCell>
                  <TableCell className="text-sm">{fmt(e.releaseAt!, e.assignment.course.timezone)}</TableCell>
                  <TableCell>
                    <ActionForm action={adminWithdrawMarksAction} compact className="flex gap-2">
                      <input type="hidden" name="evaluationId" value={e.id} />
                      <Input name="reason" placeholder="Reason (the TA sees it)" required maxLength={REASON_MAX_LENGTH} aria-label={`Reason for withdrawing ${e.student.name}'s marks`} className="h-7 min-w-0 flex-1" />
                      <SubmitButton size="xs" variant="outline">
                        Withdraw
                      </SubmitButton>
                    </ActionForm>
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
