"use server";

import { requireUser } from "@/server/auth/session";
import { attempt, run, str, type ActionState } from "@/server/action-utils";
import { markAttendance } from "@/server/services/bookings";
import { claimSurvey } from "@/server/services/feedback";
import { clearMarks, reviewEvaluation, submitEvaluations, unlockEvaluation, finalizeMany, withdrawEvaluation } from "@/server/services/evaluations";
import { RELEASE_HOLD_HOURS } from "@/domain/evaluation";

export async function submitManyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ids = fd.getAll("evaluationId").map(String);
    if (ids.length === 0) return "Nothing selected.";
    const user = await requireUser();
    const res = await submitEvaluations(user, ids);
    const released = res.filter((r) => r.status === "FINALIZED").length;
    const held = res.filter((r) => r.releaseAt).length;
    const review = res.length - released - held;
    const marks = (n: number) => `${n} mark${n === 1 ? "" : "s"}`;
    const survey = (await claimSurvey(user, "marking")) ? "marking" : undefined;
    // One word per outcome: "released" when students can see them, "sent for review" otherwise.
    const message = [
      released ? `${marks(released)} released to ${released === 1 ? "the student" : "students"}` : "",
      held ? `${marks(held)} released; ${held === 1 ? "the student sees it" : "students see them"} in ${RELEASE_HOLD_HOURS} hours (you can withdraw until then)` : "",
      review ? `${marks(review)} sent for review` : "",
    ]
      .filter(Boolean)
      .join(", ");
    return { message: `${message}.`, survey };
  });
}

export async function reviewAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const decision = str(fd, "decision") === "return" ? "return" : "finalize";
    await reviewEvaluation(await requireUser(), str(fd, "evaluationId"), decision, str(fd, "comment"));
    return decision === "finalize" ? "Marks released to the student." : "Returned to the TA.";
  });
}

export async function unlockAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await unlockEvaluation(await requireUser(), str(fd, "evaluationId"), str(fd, "reason"));
    return "Unlocked for editing.";
  });
}

export async function withdrawAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await withdrawEvaluation(await requireUser(), str(fd, "evaluationId"));
    return "Marks withdrawn. They're a draft again, and the student never saw them.";
  });
}

export async function finalizeManyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const ids = fd.getAll("evaluationId").map(String);
    if (ids.length === 0) return "Nothing to finalize.";
    const n = await finalizeMany(await requireUser(), ids);
    return `${n} mark${n === 1 ? "" : "s"} released to students.`;
  });
}

/** Attendance from the marking sheet (no page refresh). */
export async function sheetAttendanceAction(bookingId: string, status: "BOOKED" | "COMPLETED" | "NO_SHOW") {
  return attempt(async () => {
    await markAttendance(await requireUser(), bookingId, status);
    return status;
  });
}

export async function clearMarksAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await clearMarks(await requireUser(), str(fd, "evaluationId"), str(fd, "reason"));
    return "Marks cleared. The booking can be changed now.";
  });
}
