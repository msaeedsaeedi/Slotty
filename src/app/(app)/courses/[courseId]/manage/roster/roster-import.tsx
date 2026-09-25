"use client";

import { useActionState, useState } from "react";
import { importRosterAction, previewRosterAction } from "@/app/actions/courses";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Pill, StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const STATUS_LABEL = {
  "new-user": ["New — will be invited", "info"],
  "new-enrollment": ["Existing account — will be added", "success"],
  "role-change": ["Role will change", "warning"],
  unchanged: ["Already enrolled", "neutral"],
} as const;

export function RosterImport({ courseId }: { courseId: string }) {
  const [preview, previewAction] = useActionState(previewRosterAction, null);
  const [dismissed, setDismissed] = useState<object | null>(null);
  const showPreview = preview?.ok && dismissed !== preview;

  if (showPreview) {
    const changes = preview.rows.filter((r) => r.status !== "unchanged").length;
    return (
      <div className="space-y-4">
        <div className="max-h-96 overflow-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted text-left">
              <tr>
                <th className="p-2">Email</th>
                <th className="p-2">Name</th>
                <th className="p-2">Role</th>
                <th className="p-2">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {preview.rows.map((r) => {
                const [label, tone] = STATUS_LABEL[r.status];
                return (
                  <tr key={r.email}>
                    <td className="p-2">{r.email}</td>
                    <td className="p-2">{r.name}</td>
                    <td className="p-2">
                      <StatusBadge status={r.role} />
                      {r.section && <span className="ml-1 text-xs text-muted-foreground">§{r.section}</span>}
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
              <p className="font-medium">{preview.errors.length} row(s) will be skipped:</p>
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
        <ActionForm
          action={importRosterAction}
          className="flex flex-wrap items-center gap-2"
          compact
          onSuccess={() => setDismissed(preview)}
        >
          <input type="hidden" name="courseId" value={courseId} />
          <input type="hidden" name="csv" value={preview.csv} />
          <SubmitButton disabled={changes === 0}>
            Import {changes} change{changes === 1 ? "" : "s"}
          </SubmitButton>
          <Button type="button" variant="ghost" onClick={() => setDismissed(preview)}>
            Back
          </Button>
        </ActionForm>
      </div>
    );
  }

  return (
    <form action={previewAction} className="space-y-3">
      <input type="hidden" name="courseId" value={courseId} />
      <div className="space-y-2">
        <Label htmlFor="file">Upload CSV</Label>
        <Input id="file" name="file" type="file" accept=".csv,text/csv" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="csv">…or paste it</Label>
        <Textarea
          id="csv"
          name="csv"
          rows={5}
          className="font-mono text-xs"
          placeholder={"email,name,role,section\nada@uni.edu,Ada Lovelace,student,A\nsam@uni.edu,Sam TA,ta,"}
        />
        <p className="text-xs text-muted-foreground">
          Only <code>email</code> is required. <code>role</code> is student (default), ta or instructor. Google Classroom exports
          (&ldquo;Email Address&rdquo;, &ldquo;First Name&rdquo;, &ldquo;Last Name&rdquo;) work as-is. New people get an email to set their
          password — no join codes needed.
        </p>
      </div>
      {preview && !preview.ok && (
        <Alert variant="destructive">
          <AlertDescription>{preview.error}</AlertDescription>
        </Alert>
      )}
      <SubmitButton variant="secondary">Preview import</SubmitButton>
    </form>
  );
}
