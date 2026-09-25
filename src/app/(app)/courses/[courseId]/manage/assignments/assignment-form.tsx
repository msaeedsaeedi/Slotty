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

export function AssignmentForm({
  action,
  courseId,
  assignmentId,
  timezone,
  defaults,
  rubricLocked,
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  courseId: string;
  assignmentId?: string;
  timezone: string;
  defaults: AssignmentDefaults;
  rubricLocked?: boolean;
}) {
  const [criteria, setCriteria] = useState(defaults.criteria.map((c) => ({ ...c, maxPoints: String(c.maxPoints) })));
  const [maxMarks, setMaxMarks] = useState(String(defaults.maxMarks || ""));
  const rubricTotal = criteria.reduce((s, c) => s + (Number(c.maxPoints) || 0), 0);

  const update = (i: number, patch: Partial<{ label: string; maxPoints: string }>) =>
    setCriteria((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  return (
    <ActionForm action={action} className="space-y-6">
      <input type="hidden" name="courseId" value={courseId} />
      {assignmentId && <input type="hidden" name="assignmentId" value={assignmentId} />}
      <input
        type="hidden"
        name="criteria"
        value={JSON.stringify(criteria.filter((c) => c.label.trim()).map((c) => ({ label: c.label.trim(), maxPoints: Number(c.maxPoints) })))}
      />

      <Card>
        <CardHeader>
          <CardTitle>1. Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" defaultValue={defaults.title} placeholder="Project 1 demo" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">What students should prepare (optional)</Label>
            <Textarea id="description" name="description" rows={3} defaultValue={defaults.description} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Marking</CardTitle>
          <CardDescription>Add rubric rows to score each part, or leave it empty and enter a single total.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="w-40 space-y-2">
            <Label htmlFor="maxMarks">Max marks</Label>
            <Input id="maxMarks" name="maxMarks" type="number" step="any" min="0" value={maxMarks} onChange={(e) => setMaxMarks(e.target.value)} required />
          </div>
          {rubricLocked && <p className="text-sm text-amber-700 dark:text-amber-400">Marking has started, so the rubric can no longer change.</p>}
          <div className="space-y-2">
            {criteria.map((c, i) => (
              <div key={i} className="flex gap-2">
                <Input aria-label="Criterion" placeholder="e.g. Functionality" value={c.label} disabled={rubricLocked} onChange={(e) => update(i, { label: e.target.value })} />
                <Input
                  aria-label="Points"
                  type="number"
                  step="any"
                  min="0"
                  className="w-24"
                  value={c.maxPoints}
                  disabled={rubricLocked}
                  onChange={(e) => update(i, { maxPoints: e.target.value })}
                />
                <Button type="button" variant="ghost" size="icon" aria-label="Remove row" disabled={rubricLocked} onClick={() => setCriteria((cs) => cs.filter((_, j) => j !== i))}>
                  <Trash2 />
                </Button>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <Button type="button" variant="outline" size="sm" disabled={rubricLocked} onClick={() => setCriteria((cs) => [...cs, { label: "", maxPoints: "" }])}>
                <Plus /> Add rubric row
              </Button>
              {criteria.length > 0 && (
                <span className={`text-sm ${rubricTotal > Number(maxMarks) ? "text-destructive" : "text-muted-foreground"}`}>
                  Rubric total {rubricTotal} / {maxMarks || 0}
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. Demo rules</CardTitle>
          <CardDescription>Times are in {timezone}.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Demos run from" name="windowStart" type="datetime-local" defaultValue={defaults.windowStart} required />
            <Field label="Until" name="windowEnd" type="datetime-local" defaultValue={defaults.windowEnd} required />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Slot length (minutes)" name="slotDurationMin" type="number" min={5} defaultValue={defaults.slotDurationMin} required />
            <Field label="Break between slots (minutes)" name="bufferMin" type="number" min={0} defaultValue={defaults.bufferMin} />
            <Field label="Students per slot" name="capacityPerSlot" type="number" min={1} defaultValue={defaults.capacityPerSlot} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Booking opens (optional)" name="bookingOpensAt" type="datetime-local" defaultValue={defaults.bookingOpensAt} hint="Leave empty to open on publish." />
            <Field label="Lock changes (hours before)" name="freezeHours" type="number" min={0} defaultValue={defaults.freezeHours} hint="No booking, cancelling or rescheduling inside this window." />
            <Field label="Changes allowed" name="maxReschedules" type="number" min={0} defaultValue={defaults.maxReschedules} hint="Per student. Reschedules and self-cancellations both count; staff changes never do." />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox name="allowStudentCancel" defaultChecked={defaults.allowStudentCancel} />
            Students may cancel their booking (before the lock)
          </label>
        </CardContent>
      </Card>

      <SubmitButton size="lg">{assignmentId ? "Save changes" : "Create assignment"}</SubmitButton>
    </ActionForm>
  );
}

function Field({ label, hint, ...props }: React.ComponentProps<typeof Input> & { label: string; hint?: string; name: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={props.name}>{label}</Label>
      <Input id={props.name} {...props} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
