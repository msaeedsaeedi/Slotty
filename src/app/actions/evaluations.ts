"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { bool, run, str, type ActionState } from "@/server/action-utils";
import { reviewEvaluation, saveEvaluation, submitEvaluations, unlockEvaluation, finalizeMany } from "@/server/services/evaluations";

export async function saveEvaluationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const intent = str(fd, "intent"); // "save" | "submit" | "save-next"
  let nextUrl = "";
  const result = await run(async () => {
    const user = await requireUser();
    const evaluationId = str(fd, "evaluationId");
    const criterionIds = fd.getAll("criterionId").map(String);
    const scores = criterionIds
      .map((criterionId) => ({
        criterionId,
        raw: str(fd, `points:${criterionId}`),
        comment: str(fd, `comment:${criterionId}`),
      }))
      .filter((s) => s.raw !== "")
      .map((s) => ({ criterionId: s.criterionId, points: Number(s.raw), comment: s.comment }));
    const total = str(fd, "totalMarks");
    await saveEvaluation(user, evaluationId, {
      scores,
      totalMarks: total === "" ? null : Number(total),
      totalOverride: bool(fd, "totalOverride"),
      overrideNote: str(fd, "overrideNote"),
      feedback: str(fd, "feedback"),
      privateNotes: str(fd, "privateNotes"),
    });
    if (intent === "submit") {
      const [r] = await submitEvaluations(user, [evaluationId]);
      nextUrl = str(fd, "returnTo");
      return r.status === "FINALIZED" ? "Submitted and finalized — marks released to the student." : "Submitted to the instructor for review.";
    }
    return "Saved.";
  });
  if (result?.ok && nextUrl) redirect(nextUrl);
  return result;
}

export async function submitManyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ids = fd.getAll("evaluationId").map(String);
    if (ids.length === 0) return "Nothing selected.";
    const res = await submitEvaluations(await requireUser(), ids);
    const finalized = res.filter((r) => r.status === "FINALIZED").length;
    return `${res.length} submitted${finalized ? ` (${finalized} finalized)` : ""}.`;
  });
}

export async function reviewAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const decision = str(fd, "decision") === "return" ? "return" : "finalize";
    await reviewEvaluation(await requireUser(), str(fd, "evaluationId"), decision, str(fd, "comment"));
    return decision === "finalize" ? "Finalized — marks released." : "Returned to the TA.";
  });
}

export async function unlockAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await unlockEvaluation(await requireUser(), str(fd, "evaluationId"), str(fd, "reason"));
    return "Unlocked for editing.";
  });
}

export async function finalizeManyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ids = fd.getAll("evaluationId").map(String);
    if (ids.length === 0) return "Nothing to finalize.";
    const n = await finalizeMany(await requireUser(), ids);
    return `${n} finalized — marks released.`;
  });
}
