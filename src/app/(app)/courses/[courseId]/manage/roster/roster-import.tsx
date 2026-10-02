"use client";

import { useActionState, useState } from "react";
import { Download, FileUp } from "lucide-react";
import { addMemberAction, importRosterAction, previewRosterAction } from "@/app/actions/courses";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Pill, StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const STATUS_LABEL = {
  "new-user": ["New — gets an invite", "info"],
  "new-enrollment": ["Has an account — added", "success"],
  "role-change": ["Role changes", "warning"],
  unchanged: ["Already here", "neutral"],
} as const;

const TEMPLATE = "email,name,role,section\nada@uni.edu,Ada Lovelace,student,A\nsam@uni.edu,Sam Khan,ta,\n";
const TEMPLATE_HREF = `data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`;

export function RosterImport({ courseId, canAddInstructors }: { courseId: string; canAddInstructors: boolean }) {
  return (
    <div className="space-y-4">
      <AddPerson courseId={courseId} canAddInstructors={canAddInstructors} />
      <ImportList courseId={courseId} />
    </div>
  );
}

/** The quick way to add a TA, a late student, or anyone else one at a time. */
function AddPerson({ courseId, canAddInstructors }: { courseId: string; canAddInstructors: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Add someone</CardTitle>
        <CardDescription>New people get an email to set a password. People who already use Slotty just get a notification.</CardDescription>
      </CardHeader>
      <CardContent>
        <ActionForm action={addMemberAction} resetOnSuccess className="space-y-3">
          <input type="hidden" name="courseId" value={courseId} />
          <div className="space-y-1.5">
            <Label htmlFor="add-email">Email</Label>
            <Input id="add-email" name="email" type="email" required autoComplete="off" placeholder="name@uni.edu" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="add-name">Name</Label>
            <Input id="add-name" name="name" maxLength={120} placeholder="Needed if they're new to Slotty" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="add-role">Role</Label>
              <select id="add-role" name="role" defaultValue="STUDENT" className="h-8 w-full rounded-lg border bg-background px-2 text-sm">
                <option value="STUDENT">Student</option>
                <option value="TA">TA</option>
                {canAddInstructors && <option value="INSTRUCTOR">Instructor</option>}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-section">Section</Label>
              <Input id="add-section" name="section" maxLength={40} placeholder="Optional" />
            </div>
          </div>
          <SubmitButton className="w-full">Add</SubmitButton>
        </ActionForm>
      </CardContent>
    </Card>
  );
}

function ImportList({ courseId }: { courseId: string }) {
  const [preview, previewAction] = useActionState(previewRosterAction, null);
  const [dismissed, setDismissed] = useState<object | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const showPreview = preview?.ok && dismissed !== preview;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import a class list</CardTitle>
        <CardDescription>For the whole class at once. You&apos;ll see who is added before anything happens; importing again later keeps everyone already here.</CardDescription>
      </CardHeader>
      <CardContent>
        {showPreview ? (
          <PreviewTable preview={preview} courseId={courseId} onDone={() => setDismissed(preview)} />
        ) : (
          <form action={previewAction} className="space-y-4">
            <input type="hidden" name="courseId" value={courseId} />

            <div className="space-y-1.5 text-sm">
              <p className="font-medium">Columns</p>
              <table className="w-full overflow-hidden rounded-lg border text-xs">
                <tbody className="divide-y">
                  {[
                    ["email", "Required"],
                    ["name", "Optional — used for new accounts"],
                    ["role", "student (default), ta or instructor"],
                    ["section", "Optional, e.g. A"],
                  ].map(([col, note]) => (
                    <tr key={col}>
                      <td className="bg-muted/50 px-2 py-1 font-mono">{col}</td>
                      <td className="px-2 py-1 text-muted-foreground">{note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-muted-foreground">
                Google Classroom exports work as they are.{" "}
                <a href={TEMPLATE_HREF} download="slotty-class-list.csv" className="inline-flex items-center gap-1 font-medium text-foreground underline">
                  <Download className="size-3" /> Download a template
                </a>
              </p>
            </div>

            <label className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed p-4 text-center text-sm hover:bg-muted/40">
              <FileUp className="size-5 text-muted-foreground" aria-hidden />
              <span className="font-medium">{fileName ?? "Choose a CSV file"}</span>
              <span className="text-xs text-muted-foreground">or drop it here</span>
              <input name="file" type="file" accept=".csv,text/csv,.tsv,.txt" className="sr-only" onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)} />
            </label>

            <div className="space-y-1.5">
              <Label htmlFor="csv">Or paste</Label>
              <Textarea
                id="csv"
                name="csv"
                rows={4}
                className="font-mono text-xs"
                placeholder={"Copy the cells from a spreadsheet, or one email per line:\nada@uni.edu\nsam@uni.edu"}
              />
            </div>
            {preview && !preview.ok && (
              <Alert variant="destructive">
                <AlertDescription>{preview.error}</AlertDescription>
              </Alert>
            )}
            <SubmitButton variant="secondary" className="w-full">
              Preview import
            </SubmitButton>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function PreviewTable({
  preview,
  courseId,
  onDone,
}: {
  preview: Extract<Awaited<ReturnType<typeof previewRosterAction>>, { ok: true }>;
  courseId: string;
  onDone: () => void;
}) {
  const changes = preview.rows.filter((r) => r.status !== "unchanged").length;
  return (
    <div className="space-y-4">
      <div className="max-h-96 overflow-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted text-left text-xs">
            <tr>
              <th className="p-2">Person</th>
              <th className="p-2">Role</th>
              <th className="p-2">Result</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {preview.rows.map((r) => {
              const [label, tone] = STATUS_LABEL[r.status];
              return (
                <tr key={r.email}>
                  <td className="p-2">
                    {r.name}
                    <span className="block text-xs text-muted-foreground">{r.email}</span>
                  </td>
                  <td className="p-2">
                    <StatusBadge status={r.role} />
                    {r.section && <span className="ml-1 text-xs text-muted-foreground">Section {r.section}</span>}
                  </td>
                  <td className="p-2">
                    <Pill tone={tone}>{label}</Pill>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {preview.errors.length > 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            <p className="font-medium">
              {preview.errors.length} line{preview.errors.length === 1 ? "" : "s"} will be skipped:
            </p>
            <ul className="mt-1 list-disc pl-4">
              {preview.errors.slice(0, 10).map((e) => (
                <li key={e.line}>
                  Line {e.line}: {e.message}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      <ActionForm action={importRosterAction} className="flex flex-wrap items-center gap-2" compact onSuccess={onDone}>
        <input type="hidden" name="courseId" value={courseId} />
        <input type="hidden" name="csv" value={preview.csv} />
        <SubmitButton disabled={changes === 0}>
          Import {changes} change{changes === 1 ? "" : "s"}
        </SubmitButton>
        <Button type="button" variant="ghost" onClick={onDone}>
          Back
        </Button>
      </ActionForm>
    </div>
  );
}
