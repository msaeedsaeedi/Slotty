"use client";

import Link from "next/link";
import { useState } from "react";
import { Download } from "lucide-react";
import { submitManyAction } from "@/app/actions/evaluations";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

export interface StudentRow {
  id: string;
  name: string;
  email: string;
  section: string | null;
  slot: string | null;
  host: string | null;
  bookingId: string | null;
  bookingStatus: string | null;
  evaluationId: string | null;
  evaluationStatus: string | null;
  /** Marked without a booking (unusual; recorded with a reason). */
  noBooking: boolean;
  total: number | null;
}

const FILTERS = {
  all: () => true,
  unbooked: (r: StudentRow) => !r.bookingStatus,
  toMark: (r: StudentRow) => (r.bookingStatus === "COMPLETED" || r.noBooking) && (!r.evaluationStatus || r.evaluationStatus === "DRAFT" || r.evaluationStatus === "RETURNED"),
  review: (r: StudentRow) => r.evaluationStatus === "SUBMITTED",
  final: (r: StudentRow) => r.evaluationStatus === "FINALIZED",
} as const;

type Filter = keyof typeof FILTERS;

const FILTER_LABELS: Record<Filter, string> = {
  all: "All",
  unbooked: "Not booked",
  toMark: "To mark",
  review: "Awaiting review",
  final: "Final",
};

const ATTENDANCE: Record<string, [string, "info" | "success" | "danger" | "neutral"]> = {
  BOOKED: ["Booked", "info"],
  COMPLETED: ["Present", "success"],
  NO_SHOW: ["No-show", "neutral"],
};

export function StudentsTable({
  rows,
  maxMarks,
  detailsHref,
  markBase,
  exportHref,
  initialFilter,
}: {
  rows: StudentRow[];
  maxMarks: number;
  detailsHref: string;
  markBase: string;
  exportHref: string;
  initialFilter?: string;
}) {
  const [filter, setFilter] = useState<Filter>(initialFilter && initialFilter in FILTERS ? (initialFilter as Filter) : "all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const visible = rows.filter(FILTERS[filter]);
  const submittable = (r: StudentRow) => r.evaluationId && r.total !== null && (r.evaluationStatus === "DRAFT" || r.evaluationStatus === "RETURNED");
  const readyIds = visible.filter(submittable).map((r) => r.evaluationId!);
  const markLink = (r: StudentRow) => (r.bookingId ? `${markBase}?booking=${r.bookingId}` : `${markBase}?student=${r.id}`);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap rounded-lg border p-0.5 text-sm" role="group" aria-label="Filter students">
          {(Object.keys(FILTERS) as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-2.5 py-1 ${filter === f ? "bg-muted font-medium" : "text-muted-foreground"}`}
            >
              {FILTER_LABELS[f]} <span className="text-xs text-muted-foreground">{rows.filter(FILTERS[f]).length}</span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={exportHref}>
              <Download /> Export CSV
            </a>
          </Button>
          <ActionForm action={submitManyAction} compact onSuccess={() => setSelected(new Set())}>
            {[...selected].map((id) => (
              <input key={id} type="hidden" name="evaluationId" value={id} />
            ))}
            <SubmitButton size="sm" disabled={selected.size === 0}>
              Submit {selected.size || ""} marked
            </SubmitButton>
          </ActionForm>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="w-8 p-2">
                <Checkbox
                  aria-label="Select all ready to submit"
                  checked={readyIds.length > 0 && readyIds.every((id) => selected.has(id))}
                  onCheckedChange={(v) => setSelected(v === true ? new Set(readyIds) : new Set())}
                />
              </th>
              <th className="p-2">Student</th>
              <th className="p-2">Demo</th>
              <th className="p-2">Attendance</th>
              <th className="p-2">Marks</th>
              <th className="p-2 text-right">Total</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {visible.map((r) => {
              const locked = r.evaluationStatus === "SUBMITTED" || r.evaluationStatus === "FINALIZED";
              const [attLabel, attTone] = (r.bookingStatus && ATTENDANCE[r.bookingStatus]) || (["Not booked", "neutral"] as const);
              return (
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
                    <Link href={`${detailsHref}/${r.id}`} className="font-medium hover:underline">
                      {r.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {r.email}
                      {r.section && ` · Section ${r.section}`}
                    </p>
                  </td>
                  <td className="p-2 text-muted-foreground">
                    {r.slot ?? "—"}
                    {r.host && <p className="text-xs">{r.host}</p>}
                  </td>
                  <td className="p-2">
                    <StatusBadge status={r.bookingStatus ?? "NONE"} label={attLabel} tone={attTone} />
                  </td>
                  <td className="p-2">
                    <span className="flex flex-wrap gap-1">
                      {r.evaluationStatus ? <StatusBadge status={r.evaluationStatus} /> : <span className="text-muted-foreground">—</span>}
                      {r.noBooking && <StatusBadge status="NO_BOOKING" label="No booking" tone="warning" />}
                    </span>
                  </td>
                  <td className="p-2 text-right tabular-nums">{r.total !== null ? `${r.total}/${maxMarks}` : "—"}</td>
                  <td className="p-2 text-right">
                    {locked || r.bookingStatus === "NO_SHOW" ? (
                      <Link href={`${detailsHref}/${r.id}`} className="text-sm font-medium text-primary hover:underline">
                        View
                      </Link>
                    ) : (
                      <Link href={markLink(r)} className="text-sm font-medium text-primary hover:underline">
                        Mark
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
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
      <p className="text-xs text-muted-foreground">
        Students without a booking can still be marked from their row; that&apos;s recorded with a reason because it&apos;s unusual.
      </p>
    </div>
  );
}
