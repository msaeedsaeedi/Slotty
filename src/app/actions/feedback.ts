"use server";

import { isSurveyPrompt } from "@/domain/analytics";
import { DomainError } from "@/domain/result";
import { requireUser } from "@/server/auth/session";
import { attempt, run, str, type ActionState } from "@/server/action-utils";
import { answerSurvey, FEEDBACK_STATUSES, setFeedbackStatus, submitFeedback } from "@/server/services/feedback";

export async function submitFeedbackAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const rating = Number(str(fd, "rating"));
    await submitFeedback(await requireUser(), { message: String(fd.get("message") ?? ""), rating: rating || null, path: str(fd, "path") });
    return "Thanks! Your feedback was sent anonymously.";
  });
}

/** Answer (1–5) or dismiss (null) the survey shown after a booking or mark submission. */
export async function answerSurveyAction(prompt: string, score: number | null) {
  return attempt(async () => {
    if (!isSurveyPrompt(prompt)) throw new DomainError("Unknown survey.");
    await answerSurvey(await requireUser(), prompt, score);
  });
}

export async function setFeedbackStatusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const status = FEEDBACK_STATUSES.find((s) => s === str(fd, "status"));
    if (!status) throw new DomainError("Unknown status.");
    await setFeedbackStatus(await requireUser(), str(fd, "feedbackId"), status);
  });
}
