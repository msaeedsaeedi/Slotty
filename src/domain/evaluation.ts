import { allow, deny, type RuleResult } from "./result";

export type EvaluationStatus = "DRAFT" | "SUBMITTED" | "RETURNED" | "FINALIZED";
export type EvaluationAction = "save" | "submit" | "finalize" | "return" | "unlock";

export interface Criterion {
  id: string;
  label: string;
  maxPoints: number;
}

export interface Score {
  criterionId: string;
  points: number;
}

/** Status reached after each action; `submit` depends on whether the course has an instructor. */
export function nextStatus(
  from: EvaluationStatus,
  action: EvaluationAction,
  opts: { courseHasInstructor: boolean },
): EvaluationStatus {
  const check = canTransition(from, action);
  if (!check.ok) throw new Error(check.reason);
  switch (action) {
    case "save":
      return from;
    case "submit":
      // A TA running a course alone has nobody to review — submitting finalizes.
      return opts.courseHasInstructor ? "SUBMITTED" : "FINALIZED";
    case "finalize":
      return "FINALIZED";
    case "return":
    case "unlock":
      return "RETURNED";
  }
}

export function canTransition(from: EvaluationStatus, action: EvaluationAction): RuleResult {
  const allowed: Record<EvaluationAction, EvaluationStatus[]> = {
    save: ["DRAFT", "RETURNED"],
    submit: ["DRAFT", "RETURNED"],
    finalize: ["SUBMITTED"],
    return: ["SUBMITTED"],
    unlock: ["FINALIZED"],
  };
  if (allowed[action].includes(from)) return allow;
  const messages: Record<EvaluationAction, string> = {
    save: "This evaluation is locked and can no longer be edited.",
    submit: "This evaluation has already been submitted.",
    finalize: "Only submitted evaluations can be finalized.",
    return: "Only submitted evaluations can be returned.",
    unlock: "Only finalized evaluations can be unlocked.",
  };
  return deny(messages[action]);
}

export function validateScores(scores: Score[], criteria: Criterion[]): RuleResult {
  const byId = new Map(criteria.map((c) => [c.id, c]));
  const seen = new Set<string>();
  for (const s of scores) {
    const c = byId.get(s.criterionId);
    if (!c) return deny("Score refers to an unknown rubric criterion.");
    if (seen.has(s.criterionId)) return deny(`"${c.label}" was scored twice.`);
    seen.add(s.criterionId);
    if (!Number.isFinite(s.points) || s.points < 0 || s.points > c.maxPoints) {
      return deny(`"${c.label}" must be between 0 and ${c.maxPoints}.`);
    }
  }
  return allow;
}

export function computeTotal(scores: Score[]): number {
  return Math.round(scores.reduce((sum, s) => sum + s.points, 0) * 100) / 100;
}

/** Everything a submission needs: every criterion scored (if there is a rubric) and a total within range. */
export function canSubmit(args: {
  criteria: Criterion[];
  scores: Score[];
  totalMarks: number | null;
  maxMarks: number;
}): RuleResult {
  if (args.criteria.length > 0) {
    const scored = new Set(args.scores.map((s) => s.criterionId));
    const missing = args.criteria.find((c) => !scored.has(c.id));
    if (missing) return deny(`Score "${missing.label}" before submitting.`);
  }
  if (args.totalMarks === null) return deny("Enter a total mark before submitting.");
  if (args.totalMarks < 0 || args.totalMarks > args.maxMarks) {
    return deny(`Total must be between 0 and ${args.maxMarks}.`);
  }
  return allow;
}
