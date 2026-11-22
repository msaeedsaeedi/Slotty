"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ActionForm, SubmitButton, useFieldError } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { checkRubric, hasMarkPrecision, MARK_DECIMALS } from "@/domain/evaluation";
import { fieldProps, type FieldProps } from "@/lib/field-props";
import { assignmentFields, criterionInput, policyFields } from "@/lib/form-schemas";
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

/** Input limits read from the schemas the server parses with (fieldProps), so the two can't drift. */
const L = {
  title: fieldProps(assignmentFields, "title"),
  description: fieldProps(assignmentFields, "description"),
  maxMarks: fieldProps(assignmentFields, "maxMarks", { step: 0.01 }),
  points: fieldProps(criterionInput, "maxPoints", { step: 0.01 }),
  label: fieldProps(criterionInput, "label"),
  slotDurationMin: fieldProps(policyFields, "slotDurationMin"),
  bufferMin: fieldProps(policyFields, "bufferMin"),
  capacityPerSlot: fieldProps(policyFields, "capacityPerSlot"),
  freezeHours: fieldProps(policyFields, "freezeHours"),
  maxReschedules: fieldProps(policyFields, "maxReschedules"),
};
const within = (n: number, p: FieldProps) => n >= (p.min ?? -Infinity) && n <= (p.max ?? Infinity);
const range = (p: FieldProps, unit = "") => `${p.min} to ${p.max}${unit}.`;

/** The server's limits (from the schemas), checked as you type. */
function validate(v: Values, criteria: { label: string; maxPoints: string }[]) {
  const e: Partial<Record<keyof Values | "criteria", string>> = {};
  if (!v.title.trim()) e.title = "Give it a title.";
  const max = num(v.maxMarks);
  if (!(max > 0) || !within(max, L.maxMarks)) e.maxMarks = `A number above 0 (up to ${L.maxMarks.max?.toLocaleString("en")}).`;
  else if (!hasMarkPrecision(max)) e.maxMarks = `Use at most ${MARK_DECIMALS} decimals.`;
  const rows = criteria.filter((c) => c.label.trim() || c.maxPoints.trim());
  if (rows.some((c) => !c.label.trim())) e.criteria = "Each rubric row needs a name.";
  else if (rows.some((c) => !(num(c.maxPoints) > 0) || !within(num(c.maxPoints), L.points))) e.criteria = "Each rubric row needs points above 0.";
  else if (rows.some((c) => !hasMarkPrecision(num(c.maxPoints)))) e.criteria = `Rubric points: use at most ${MARK_DECIMALS} decimals.`;
  else if (max > 0 && rows.length) {
    const rubric = checkRubric(rows.map((c) => ({ maxPoints: num(c.maxPoints) })), max);
    if (!rubric.ok) e.criteria = rubric.reason;
  }
  if (!v.windowStart) e.windowStart = "When do demos start?";
  if (!v.windowEnd) e.windowEnd = "When do demos end?";
  else if (v.windowStart && v.windowEnd <= v.windowStart) e.windowEnd = "Must be after the start.";
  if (!within(int(v.slotDurationMin), L.slotDurationMin)) e.slotDurationMin = range(L.slotDurationMin, " minutes");
  if (!within(int(v.bufferMin), L.bufferMin)) e.bufferMin = range(L.bufferMin, " minutes");
  if (!within(int(v.capacityPerSlot), L.capacityPerSlot)) e.capacityPerSlot = range(L.capacityPerSlot, " students");
  if (v.bookingOpensAt && v.windowEnd && v.bookingOpensAt >= v.windowEnd) e.bookingOpensAt = "Must be before demos end.";
  if (!within(int(v.freezeHours), L.freezeHours)) e.freezeHours = `${range(L.freezeHours, " hours").slice(0, -1)} (two weeks).`;
  if (!within(int(v.maxReschedules), L.maxReschedules)) e.maxReschedules = range(L.maxReschedules);
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
              <Input {...field("title")} {...L.title} placeholder="Project 1 demo" />
            </Field>
            <Field label="What students should prepare" hint="Optional. Shown on the booking page.">
              <Textarea {...field("description")} {...L.description} rows={2} />
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
              <Input {...field("maxMarks")} {...L.maxMarks} type="number" inputMode="decimal" />
            </Field>
            {rubricLocked && <p className="text-sm text-amber-700 dark:text-amber-400">Marking has started, so the rubric can no longer change.</p>}
            {criteria.length > 0 && (
              <div className="space-y-2">
                {criteria.map((c, i) => (
                  <div key={i} className="flex gap-2">
                    <Input aria-label="Criterion" placeholder="e.g. Functionality" value={c.label} disabled={rubricLocked} maxLength={L.label.maxLength} onChange={(e) => update(i, { label: e.target.value })} />
                    <Input
                      aria-label="Points"
                      type="number"
                      inputMode="decimal"
                      min={L.points.min}
                      max={L.points.max}
                      step={L.points.step}
                      className="w-24 text-right"
                      value={c.maxPoints}
                      disabled={rubricLocked}
                      onChange={(e) => update(i, { maxPoints: e.target.value })}
                    />
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
                <span className={cn("text-sm tabular-nums", rubricTotal !== Number(v.maxMarks) ? "text-destructive" : "text-muted-foreground")}>
                  Rubric {rubricTotal} of {v.maxMarks || 0}
                </span>
              )}
            </div>
            <CriteriaError error={(tried || criteria.some((c) => c.label || c.maxPoints)) ? errors.criteria : undefined} />
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
                <Input {...field("slotDurationMin")} {...L.slotDurationMin} type="number" inputMode="numeric" />
              </Field>
              <Field label="Break after" hint="minutes" error={shown("bufferMin")}>
                <Input {...field("bufferMin")} {...L.bufferMin} type="number" inputMode="numeric" />
              </Field>
              <Field label="Students each" hint="1 = one-to-one" error={shown("capacityPerSlot")}>
                <Input {...field("capacityPerSlot")} {...L.capacityPerSlot} type="number" inputMode="numeric" />
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
                <Input {...field("freezeHours")} {...L.freezeHours} type="number" inputMode="numeric" />
              </Field>
              <Field label="Changes each student may make" hint="Moves and self-cancellations count; staff changes never do." error={shown("maxReschedules")}>
                <Input {...field("maxReschedules")} {...L.maxReschedules} type="number" inputMode="numeric" />
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

/** The rubric's message: checked as you type, or the server's ("criteria") after a submit. */
function CriteriaError({ error }: { error?: string }) {
  const server = useFieldError("criteria");
  const message = error ?? server;
  return message ? (
    <p className="text-sm text-destructive" role="alert">
      {message}
    </p>
  ) : null;
}

/** A FormField named after its input's id (the form's field names), so server messages land here too. */
function Field({ label, hint, error, className, children }: { label: string; hint?: string; error?: string; className?: string; children: React.ReactElement<{ id?: string }> }) {
  return (
    <FormField name={children.props.id ?? ""} label={label} hint={hint} error={error} className={className}>
      {children}
    </FormField>
  );
}
