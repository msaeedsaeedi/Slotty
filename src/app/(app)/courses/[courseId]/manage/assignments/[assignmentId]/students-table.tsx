"use client";

import Link from "next/link";
import { useState } from "react";
import { submitManyAction } from "@/app/actions/evaluations";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { StatusBadge } from "@/components/status-badge";
import { Checkbox } from "@/components/ui/checkbox";

export interface StudentRow {
  id: string;
  name: string;
  email: string;
  section: string | null;
  slot: string | null;
  host: string | null;
  bookingStatus: string | null;
  evaluationId: string | null;
  evaluationStatus: string | null;
  total: number | null;
}

const FILTERS = {
  all: () => true,
  unbooked: (r: StudentRow) => !r.bookingStatus,
  toMark: (r: StudentRow) => r.bookingStatus === "COMPLETED" && (!r.evaluationStatus || r.evaluationStatus === "DRAFT" || r.evaluationStatus === "RETURNED"),
  review: (r: StudentRow) => r.evaluationStatus === "SUBMITTED",
  final: (r: StudentRow) => r.evaluationStatus === "FINALIZED",
} as const;

const FILTER_LABELS: Record<keyof typeof FILTERS, string> = {
  all: "All",
  unbooked: "Not booked",
  toMark: "To mark",
  review: "Awaiting review",
  final: "Finalized",
};

export function StudentsTable({ rows, maxMarks, markHref }: { rows: StudentRow[]; maxMarks: number; markHref: string }) {
  const [filter, setFilter] = useState<keyof typeof FILTERS>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const visible = rows.filter(FILTERS[filter]);
  const submittable = (r: StudentRow) => r.evaluationId && r.total !== null && (r.evaluationStatus === "DRAFT" || r.evaluationStatus === "RETURNED");
  const readyIds = visible.filter(submittable).map((r) => r.evaluationId!);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap rounded-lg border p-0.5 text-sm">
          {(Object.keys(FILTERS) as (keyof typeof FILTERS)[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-md px-2.5 py-1 ${filter === f ? "bg-muted font-medium" : "text-muted-foreground"}`}
            >
              {FILTER_LABELS[f]} <span className="text-xs text-muted-foreground">{rows.filter(FILTERS[f]).length}</span>
            </button>
          ))}
        </div>
        <ActionForm action={submitManyAction} compact className="ml-auto" onSuccess={() => setSelected(new Set())}>
          {[...selected].map((id) => (
            <input key={id} type="hidden" name="evaluationId" value={id} />
          ))}
          <SubmitButton size="sm" disabled={selected.size === 0}>
            Submit {selected.size || ""} marked
          </SubmitButton>
        </ActionForm>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="w-8 p-2">
                <Checkbox
                  aria-label="Select all ready"
                  checked={readyIds.length > 0 && readyIds.every((id) => selected.has(id))}
                  onCheckedChange={(v) => setSelected(v === true ? new Set(readyIds) : new Set())}
                />
              </th>
              <th className="p-2">Student</th>
              <th className="p-2">Demo</th>
              <th className="p-2">Attendance</th>
              <th className="p-2">Evaluation</th>
              <th className="p-2 text-right">Total</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {visible.map((r) => (
              <tr key={r.id}>
                <td className="p-2">
                  {submittable(r) && (
                    <Checkbox
                      aria-label={`Select ${r.name}`}
                      checked={selected.has(r.evaluationId!)}
                      onCheckedChange={(v) =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (v === true) next.add(r.evaluationId!);
                          else next.delete(r.evaluationId!);
                          return next;
                        })
                      }
                    />
                  )}
                </td>
                <td className="p-2">
                  <p className="font-medium">{r.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.email}
                    {r.section && ` · §${r.section}`}
                  </p>
                </td>
                <td className="p-2 text-muted-foreground">
                  {r.slot ?? "—"}
                  {r.host && <p className="text-xs">{r.host}</p>}
                </td>
                <td className="p-2">{r.bookingStatus ? <StatusBadge status={r.bookingStatus} label={r.bookingStatus === "BOOKED" ? "Pending" : undefined} /> : <StatusBadge status="NONE" label="Not booked" tone="warning" />}</td>
                <td className="p-2">{r.evaluationStatus ? <StatusBadge status={r.evaluationStatus} /> : <span className="text-muted-foreground">—</span>}</td>
                <td className="p-2 text-right tabular-nums">{r.total !== null ? `${r.total}/${maxMarks}` : "—"}</td>
                <td className="p-2 text-right">
                  <Link href={`${markHref}/${r.id}`} className="text-sm font-medium text-primary hover:underline">
                    {r.evaluationStatus === "SUBMITTED" || r.evaluationStatus === "FINALIZED" ? "View" : "Mark"}
                  </Link>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-muted-foreground">
                  No students here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
