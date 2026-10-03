"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ActionState } from "@/server/action-utils";

export interface AssignmentDefaults {
  title: string;
  description: string;
  maxMarks: number;
  criteria: { label: string; maxPoints: number }[];
  windowStart: string;
  windowEnd: string;
  slotDurationMin: number;
  bufferMin: number;
  capacityPerSlot: number;
  bookingOpensAt: string;
  freezeHours: number;
  maxReschedules: number;
  allowStudentCancel: boolean;
}

type Values = Omit<AssignmentDefaults, "criteria" | "maxMarks" | "slotDurationMin" | "bufferMin" | "capacityPerSlot" | "freezeHours" | "maxReschedules"> & {
  maxMarks: string;
  slotDurationMin: string;
  bufferMin: string;
  capacityPerSlot: string;
  freezeHours: string;
  maxReschedules: string;
};

const int = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v) : NaN);
const num = (v: string) => (v.trim() === "" ? NaN : Number(v));

/** Same limits the server enforces, checked as you type. */
function validate(v: Values, criteria: { label: string; maxPoints: string }[]) {
  const e: Partial<Record<keyof Values | "criteria", string>> = {};
  if (!v.title.trim()) e.title = "Give it a title.";
  const max = num(v.maxMarks);
  if (!(max > 0) || max > 10_000) e.maxMarks = "A number above 0 (up to 10,000).";
  const rows = criteria.filter((c) => c.label.trim() || c.maxPoints.trim());
  if (rows.some((c) => !c.label.trim())) e.criteria = "Each rubric row needs a name.";
  else if (rows.some((c) => !(num(c.maxPoints) > 0))) e.criteria = "Each rubric row needs points above 0.";
  else if (max > 0 && rows.reduce((s, c) => s + num(c.maxPoints), 0) > max + 1e-9) e.criteria = `The rows add up to more than ${max}. Lower them or raise the max marks.`;
  if (!v.windowStart) e.windowStart = "When do demos start?";
  if (!v.windowEnd) e.windowEnd = "When do demos end?";
  else if (v.windowStart && v.windowEnd <= v.windowStart) e.windowEnd = "Must be after the start.";
  const len = int(v.slotDurationMin);
  if (!(len >= 5 && len <= 480)) e.slotDurationMin = "5 to 480 minutes.";
  const brk = int(v.bufferMin);
  if (!(brk >= 0 && brk <= 240)) e.bufferMin = "0 to 240 minutes.";
  const cap = int(v.capacityPerSlot);
  if (!(cap >= 1 && cap <= 100)) e.capacityPerSlot = "1 to 100 students.";
  if (v.bookingOpensAt && v.windowEnd && v.bookingOpensAt >= v.windowEnd) e.bookingOpensAt = "Must be before demos end.";
  const freeze = int(v.freezeHours);
  if (!(freeze >= 0 && freeze <= 336)) e.freezeHours = "0 to 336 hours (two weeks).";
  const changes = int(v.maxReschedules);
  if (!(changes >= 0 && changes <= 20)) e.maxReschedules = "0 to 20.";
  return e;
}

export function AssignmentForm({
  action,
  courseId,
  assignmentId,
  timezoneLabel,
  defaults,
  rubricLocked,
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  courseId: string;
  assignmentId?: string;
  timezoneLabel: string;
  defaults: AssignmentDefaults;
  rubricLocked?: boolean;
}) {
  const [v, setV] = useState<Values>(() => ({
    ...defaults,
    maxMarks: String(defaults.maxMarks || ""),
    slotDurationMin: String(defaults.slotDurationMin),
    bufferMin: String(defaults.bufferMin),
    capacityPerSlot: String(defaults.capacityPerSlot),
    freezeHours: String(defaults.freezeHours),
    maxReschedules: String(defaults.maxReschedules),
  }));
  const [criteria, setCriteria] = useState(defaults.criteria.map((c) => ({ ...c, maxPoints: String(c.maxPoints) })));
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [tried, setTried] = useState(false);
  const errors = validate(v, criteria);
  const errorCount = Object.keys(errors).length;
  const shown = (k: keyof typeof errors) => (tried || touched.has(k) ? errors[k] : undefined);

  const set = <K extends keyof Values>(k: K) => (value: Values[K]) => setV((x) => ({ ...x, [k]: value }));
  const field = (k: keyof Values) => ({
    id: k,
    name: k,
    value: v[k] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(k)(e.target.value as never),
    onBlur: () => setTouched((t) => new Set(t).add(k)),
    "aria-invalid": Boolean(shown(k as keyof typeof errors)),
  });

  const rubricTotal = criteria.reduce((s, c) => s + (Number(c.maxPoints) || 0), 0);
  const update = (i: number, patch: Partial<{ label: string; maxPoints: string }>) => setCriteria((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  // Live summary of what these settings mean.
  const len = int(v.slotDurationMin);
  const step = len + (int(v.bufferMin) || 0);
  const perHour = len > 0 && step > 0 ? Math.floor(60 / step) || 0 : 0;
  const days = v.windowStart && v.windowEnd && v.windowEnd > v.windowStart ? Math.ceil((Date.parse(v.windowEnd) - Date.parse(v.windowStart)) / 86_400_000) : null;
  const rules = [
    v.bookingOpensAt ? `Booking opens ${v.bookingOpensAt.replace("T", " ")}` : "Booking opens when you open it",
    `changes lock ${v.freezeHours || 0} h before`,
    `${v.maxReschedules || 0} change${v.maxReschedules === "1" ? "" : "s"} each`,
    v.allowStudentCancel ? "students can cancel" : "only staff can cancel",
  ].join(" · ");

  return (
    <ActionForm action={action} className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="space-y-5">
        <input type="hidden" name="courseId" value={courseId} />
        {assignmentId && <input type="hidden" name="assignmentId" value={assignmentId} />}
        <input
          type="hidden"
          name="criteria"
          value={JSON.stringify(criteria.filter((c) => c.label.trim()).map((c) => ({ label: c.label.trim(), maxPoints: Number(c.maxPoints) })))}
        />

        <Card>
          <CardHeader>
            <CardTitle>What</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Title" error={shown("title")}>
              <Input {...field("title")} placeholder="Project 1 demo" required maxLength={200} />
            </Field>
            <Field label="What students should prepare" hint="Optional. Shown on the booking page.">
              <Textarea {...field("description")} rows={2} maxLength={5000} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Marking</CardTitle>
            <CardDescription>Score each part with rubric rows, or leave the rubric empty and enter one mark.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Max marks" error={shown("maxMarks")} className="w-40">
              <Input {...field("maxMarks")} inputMode="decimal" required />
            </Field>
            {rubricLocked && <p className="text-sm text-amber-700 dark:text-amber-400">Marking has started, so the rubric can no longer change.</p>}
            {criteria.length > 0 && (
              <div className="space-y-2">
                {criteria.map((c, i) => (
                  <div key={i} className="flex gap-2">
                    <Input aria-label="Criterion" placeholder="e.g. Functionality" value={c.label} disabled={rubricLocked} maxLength={120} onChange={(e) => update(i, { label: e.target.value })} />
                    <Input aria-label="Points" inputMode="decimal" className="w-20 text-right" value={c.maxPoints} disabled={rubricLocked} onChange={(e) => update(i, { maxPoints: e.target.value })} />
                    <Button type="button" variant="ghost" size="icon" aria-label="Remove row" disabled={rubricLocked} onClick={() => setCriteria((cs) => cs.filter((_, j) => j !== i))}>
                      <Trash2 />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button type="button" variant="outline" size="sm" disabled={rubricLocked} onClick={() => setCriteria((cs) => [...cs, { label: "", maxPoints: "" }])}>
                <Plus /> Add rubric row
              </Button>
              {criteria.length > 0 && (
                <span className={cn("text-sm tabular-nums", rubricTotal > Number(v.maxMarks) ? "text-destructive" : "text-muted-foreground")}>
                  Rubric {rubricTotal} of {v.maxMarks || 0}
                </span>
              )}
            </div>
            {(tried || criteria.some((c) => c.label || c.maxPoints)) && errors.criteria && <p className="text-sm text-destructive">{errors.criteria}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>When</CardTitle>
            <CardDescription>Times are {timezoneLabel}. You add the exact hours you&apos;re free later, as slots.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Demos run from" error={shown("windowStart")}>
                <Input {...field("windowStart")} type="datetime-local" required />
              </Field>
              <Field label="Until" error={shown("windowEnd") ?? (v.windowEnd && v.windowStart && v.windowEnd <= v.windowStart ? errors.windowEnd : undefined)}>
                <Input {...field("windowEnd")} type="datetime-local" required min={v.windowStart || undefined} />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Slot length" hint="minutes" error={shown("slotDurationMin")}>
                <Input {...field("slotDurationMin")} inputMode="numeric" required />
              </Field>
              <Field label="Break after" hint="minutes" error={shown("bufferMin")}>
                <Input {...field("bufferMin")} inputMode="numeric" />
              </Field>
              <Field label="Students each" hint="1 = one-to-one" error={shown("capacityPerSlot")}>
                <Input {...field("capacityPerSlot")} inputMode="numeric" />
              </Field>
            </div>
          </CardContent>
        </Card>

        <details className="group rounded-xl border bg-card" open={Boolean(errors.bookingOpensAt || errors.freezeHours || errors.maxReschedules) && tried}>
          <summary className="cursor-pointer list-none p-4">
            <span className="flex items-center justify-between gap-2 font-medium">
              Booking rules <span className="text-xs font-normal text-muted-foreground group-open:hidden">Change</span>
            </span>
            <span className="mt-0.5 block text-sm text-muted-foreground">{rules}</span>
          </summary>
          <div className="space-y-4 border-t p-4">
            <Field label="Booking opens (optional)" hint="Leave empty to open as soon as you open booking. Set a time to announce it in advance." error={shown("bookingOpensAt")}>
              <Input {...field("bookingOpensAt")} type="datetime-local" max={v.windowEnd || undefined} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Lock changes (hours before the demo)" hint="Inside this time students can't book, cancel or move." error={shown("freezeHours")}>
                <Input {...field("freezeHours")} inputMode="numeric" />
              </Field>
              <Field label="Changes each student may make" hint="Moves and self-cancellations count; staff changes never do." error={shown("maxReschedules")}>
                <Input {...field("maxReschedules")} inputMode="numeric" />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox name="allowStudentCancel" checked={v.allowStudentCancel} onCheckedChange={(c) => set("allowStudentCancel")(c === true)} />
              Students may cancel their own booking (before the lock)
            </label>
          </div>
        </details>
      </div>

      <aside className="lg:sticky lg:top-20 lg:h-fit">
        <Card className="gap-3 p-4 text-sm">
          <p className="font-medium">Summary</p>
          <ul className="space-y-1.5 text-muted-foreground">
            <li>{days ? `Demos over ${days} day${days === 1 ? "" : "s"}` : "Set when demos run"}</li>
            <li>{len >= 5 ? `${len}-minute slots${perHour ? ` · up to ${perHour} an hour per host` : ""}` : "Set a slot length"}</li>
            <li>Marked out of {v.maxMarks || "?"}{criteria.length ? ` · ${criteria.length} rubric row${criteria.length === 1 ? "" : "s"}` : ""}</li>
          </ul>
          {!assignmentId && (
            <p className="rounded-lg bg-muted p-2 text-xs">
              Next you&apos;ll add your slots. Students can&apos;t see this assignment until you open booking.
            </p>
          )}
          {tried && errorCount > 0 && (
            <p className="text-xs text-destructive" role="alert">
              Fix {errorCount === 1 ? "the highlighted field" : `the ${errorCount} highlighted fields`} first.
            </p>
          )}
          <SubmitButton size="lg" className="w-full" onClick={(e) => {
            setTried(true);
            if (errorCount > 0) e.preventDefault();
          }}>
            {assignmentId ? "Save changes" : "Create assignment"}
          </SubmitButton>
        </Card>
      </aside>
    </ActionForm>
  );
}

function Field({ label, hint, error, className, children }: { label: string; hint?: string; error?: string; className?: string; children: React.ReactElement<{ id?: string }> }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={children.props.id}>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
