import { allow, deny, type RuleResult } from "./result";

export type EvaluationStatus = "DRAFT" | "SUBMITTED" | "RETURNED" | "FINALIZED";
export type EvaluationAction = "save" | "submit" | "finalize" | "return" | "unlock" | "withdraw" | "release";

/** How long a TA's marks wait before students see them in a course without an instructor (ADR-032). */
export const RELEASE_HOLD_HOURS = 24;

/**
 * Where a submit goes (ADR-032): to the instructor for review; held for `RELEASE_HOLD_HOURS`
 * when a TA submits in a course without an instructor; or final straight away when an
 * instructor submits, since they are the reviewer.
 */
export type SubmitRoute = "review" | "hold" | "final";

export function submitRoute(submitter: "INSTRUCTOR" | "TA", courseHasInstructor: boolean): SubmitRoute {
  if (submitter === "INSTRUCTOR") return "final";
  return courseHasInstructor ? "review" : "hold";
}

/** When held marks reach the student. */
export function releaseAtFor(submittedAt: Date): Date {
  return new Date(submittedAt.getTime() + RELEASE_HOLD_HOURS * 3_600_000);
}

/** Held marks: submitted with a release time, waiting for the worker (no reviewer involved). */
export function isHeld(evaluation: { status: EvaluationStatus; releaseAt: Date | null }): boolean {
  return evaluation.status === "SUBMITTED" && evaluation.releaseAt !== null;
}

/**
 * Who may withdraw held marks before they reach the student: the TA who submitted them, or an
 * admin from the admin console (`by: "admin"`, a moderation exception to ADR-025). Not other TAs.
 */
export function canWithdraw(
  evaluation: { status: EvaluationStatus; releaseAt: Date | null; submittedById: string | null },
  by: { kind: "staff"; id: string } | { kind: "admin" },
  now: Date,
): RuleResult {
  if (!isHeld(evaluation)) return deny("Only marks waiting to be released can be withdrawn.");
  if (evaluation.releaseAt! <= now) return deny("These marks have already been released.");
  if (by.kind === "staff" && evaluation.submittedById !== by.id) return deny("Only the TA who submitted these marks can withdraw them.");
  return allow;
}

export interface Criterion {
  id: string;
  label: string;
  maxPoints: number;
}

export interface Score {
  criterionId: string;
  points: number;
}

/** Status reached after each action; `submit` depends on its route (`submitRoute`). */
export function nextStatus(from: EvaluationStatus, action: EvaluationAction, opts: { route?: SubmitRoute } = {}): EvaluationStatus {
  const check = canTransition(from, action);
  if (!check.ok) throw new Error(check.reason);
  switch (action) {
    case "save":
      return from;
    case "submit":
      // Held marks stay SUBMITTED until the worker releases them, so a rollback fails closed.
      return opts.route === "final" ? "FINALIZED" : "SUBMITTED";
    case "finalize":
    case "release":
      return "FINALIZED";
    case "withdraw":
      return "DRAFT";
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
    withdraw: ["SUBMITTED"],
    release: ["SUBMITTED"],
  };
  if (allowed[action].includes(from)) return allow;
  const messages: Record<EvaluationAction, string> = {
    save: "This evaluation is locked and can no longer be edited.",
    submit: "This evaluation has already been submitted.",
    finalize: "Only submitted evaluations can be finalized.",
    return: "Only submitted evaluations can be returned.",
    unlock: "Only finalized evaluations can be unlocked.",
    withdraw: "Only marks waiting to be released can be withdrawn.",
    release: "Only submitted marks can be released.",
  };
  return deny(messages[action]);
}

/** Marks are kept to at most this many decimals (8.25, not 8.253). */
export const MARK_DECIMALS = 2;

/** At most MARK_DECIMALS decimals (floating-point noise such as 0.1 + 0.2 is tolerated). */
export function hasMarkPrecision(value: number): boolean {
  const scaled = value * 10 ** MARK_DECIMALS;
  return Math.abs(scaled - Math.round(scaled)) < 1e-6;
}

/** A total mark (no rubric, or an override): between 0 and the max, with at most two decimals. */
export function checkTotalMarks(total: number, maxMarks: number): RuleResult {
  if (!Number.isFinite(total) || total < 0 || total > maxMarks) return deny(`Total must be between 0 and ${maxMarks}.`);
  if (!hasMarkPrecision(total)) return deny(`Use at most ${MARK_DECIMALS} decimals for the total.`);
  return allow;
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
    if (!hasMarkPrecision(s.points)) return deny(`"${c.label}": use at most ${MARK_DECIMALS} decimals.`);
  }
  return allow;
}

/**
 * A rubric must add up to exactly the max marks: fewer points would make full
 * marks unreachable (6 + 3 out of 10 tops out at 9), more would let totals
 * exceed the maximum. An assignment without a rubric is marked as one total.
 */
export function checkRubric(criteria: { maxPoints: number }[], maxMarks: number): RuleResult {
  if (criteria.length === 0) return allow;
  const total = Math.round(criteria.reduce((s, c) => s + c.maxPoints, 0) * 100) / 100;
  if (Math.abs(total - maxMarks) < 1e-9) return allow;
  return total > maxMarks
    ? deny(`The rubric rows add up to ${total}, more than the max marks (${maxMarks}). Lower them or raise the max marks.`)
    : deny(`The rubric rows add up to ${total}, but the max marks are ${maxMarks}, so full marks would be impossible. Make them add up to ${maxMarks}.`);
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

/**
 * Once marks are recorded, the booking they belong to is pinned: cancelling or
 * moving it would leave marks for a demo that no longer exists. Staff clear (or
 * unlock and clear) the marks first; students ask staff.
 */
export function canChangeMarkedBooking(evaluation: { status: EvaluationStatus; totalMarks: number | null } | null, who: "staff" | "student"): RuleResult {
  if (!evaluation || (evaluation.totalMarks === null && evaluation.status === "DRAFT")) return allow;
  if (who === "student") return deny("Your demo has already been marked, so it can't be changed. Send your TA a request if something is wrong.");
  if (evaluation.status === "SUBMITTED" || evaluation.status === "FINALIZED") {
    return deny("their marks are already submitted. Unlock and clear the marks on their student page first.");
  }
  return deny("they already have marks for this demo. Clear the marks on their student page first.");
}

/**
 * Who may read a private note on an evaluation (ADR-031): its author, and the course's enrolled
 * instructors. `enrolledRole` is the viewer's own enrollment in the course, not the role an
 * admin is read as (`courseRoleOf`), so admins never read notes. A note without an author
 * (written before notes had one) is for the instructors only.
 */
export function canReadPrivateNote(note: { authorId: string | null }, viewer: { id: string; enrolledRole: "INSTRUCTOR" | "TA" | "STUDENT" | null }): RuleResult {
  if (viewer.enrolledRole === "INSTRUCTOR") return allow;
  if (viewer.enrolledRole === "TA" && note.authorId === viewer.id) return allow;
  return deny("Private notes are for their author and the course instructors only.");
}
