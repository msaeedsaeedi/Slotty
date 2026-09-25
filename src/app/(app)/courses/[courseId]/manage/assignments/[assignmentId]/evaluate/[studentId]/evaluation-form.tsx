"use client";

import { useState } from "react";
import { saveEvaluationAction } from "@/app/actions/evaluations";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  evaluationId: string;
  returnTo: string;
  maxMarks: number;
  criteria: { id: string; label: string; maxPoints: number }[];
  initial: {
    scores: Record<string, { points: string; comment: string }>;
    totalMarks: string;
    totalOverride: boolean;
    overrideNote: string;
    feedback: string;
    privateNotes: string;
  };
  submitLabel: string;
}

export function EvaluationForm({ evaluationId, returnTo, maxMarks, criteria, initial, submitLabel }: Props) {
  const [scores, setScores] = useState(initial.scores);
  const [override, setOverride] = useState(initial.totalOverride);
  const [total, setTotal] = useState(initial.totalMarks);
  const rubricSum = criteria.reduce((s, c) => s + (Number(scores[c.id]?.points) || 0), 0);
  const hasRubric = criteria.length > 0;
  const shownTotal = hasRubric && !override ? String(Math.round(rubricSum * 100) / 100) : total;

  return (
    <ActionForm action={saveEvaluationAction} className="space-y-4">
      <input type="hidden" name="evaluationId" value={evaluationId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      {hasRubric && (
        <Card>
          <CardHeader>
            <CardTitle>Rubric</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {criteria.map((c) => (
              <div key={c.id} className="grid gap-2 sm:grid-cols-[1fr_110px]">
                <input type="hidden" name="criterionId" value={c.id} />
                <div className="space-y-1">
                  <Label htmlFor={`points:${c.id}`}>{c.label}</Label>
                  <Input
                    name={`comment:${c.id}`}
                    placeholder="Comment (visible to student)"
                    defaultValue={scores[c.id]?.comment}
                    className="h-7 text-xs"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <Input
                    id={`points:${c.id}`}
                    name={`points:${c.id}`}
                    type="number"
                    step="any"
                    min={0}
                    max={c.maxPoints}
                    inputMode="decimal"
                    className="text-right tabular-nums"
                    value={scores[c.id]?.points ?? ""}
                    onChange={(e) => setScores((s) => ({ ...s, [c.id]: { comment: s[c.id]?.comment ?? "", points: e.target.value } }))}
                  />
                  <span className="whitespace-nowrap text-sm text-muted-foreground">/ {c.maxPoints}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Total</CardTitle>
          {hasRubric && <CardDescription>Calculated from the rubric unless you override it.</CardDescription>}
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Input
              name="totalMarks"
              type="number"
              step="any"
              min={0}
              max={maxMarks}
              className="w-28 text-right text-lg font-semibold tabular-nums"
              value={shownTotal}
              readOnly={hasRubric && !override}
              onChange={(e) => setTotal(e.target.value)}
              aria-label="Total marks"
            />
            <span className="text-muted-foreground">/ {maxMarks}</span>
          </div>
          {hasRubric && (
            <>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  name="totalOverride"
                  checked={override}
                  onCheckedChange={(v) => {
                    setOverride(v === true);
                    if (v === true) setTotal(String(rubricSum));
                  }}
                />
                Override the total
              </label>
              {override && <Input name="overrideNote" placeholder="Why? (required)" defaultValue={initial.overrideNote} />}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="feedback">Feedback for the student</Label>
            <Textarea id="feedback" name="feedback" rows={3} defaultValue={initial.feedback} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="privateNotes">Private notes</Label>
            <Textarea id="privateNotes" name="privateNotes" rows={2} defaultValue={initial.privateNotes} placeholder="Only staff can see these." />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <SubmitButton name="intent" value="save" variant="outline">
          Save draft
        </SubmitButton>
        <SubmitButton name="intent" value="submit">
          {submitLabel}
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
