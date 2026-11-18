import { z } from "zod";
import type { FeedbackStatus } from "@/generated/prisma/client";
import { canAnswerSurvey, canPromptSurvey, canSendFeedback, FEEDBACK_MAX_LENGTH, routeTemplate, startOfHour, startOfUtcDay, validScore, type SurveyPromptId } from "@/domain/analytics";
import { assertRule, DomainError } from "@/domain/result";
import { appVersion } from "@/server/analytics-config";
import { db } from "@/server/db";
import { assertPlatform, type Actor } from "./access";
import { roleKindOf } from "./analytics";
import { audit } from "./audit";

// ─── Feedback ────────────────────────────────────────────────────────────────

const feedbackInput = z.object({
  message: z.string().max(FEEDBACK_MAX_LENGTH + 100),
  rating: z.number().int().nullable(),
  path: z.string().max(300),
});

/** Messages per user in the last hour, per web process. Kept in memory only, so nothing ties a message to its sender. */
const sent = new Map<string, number[]>();

function sentLastHour(userId: string, now: number): number {
  const times = (sent.get(userId) ?? []).filter((t) => now - t < 3_600_000);
  sent.set(userId, times);
  return times.length;
}

/**
 * Anonymous feedback from the in-app button. Stores the message, rating, page
 * (as a route template), role and release; never the user.
 */
export async function submitFeedback(actor: Actor, input: z.input<typeof feedbackInput>, now = new Date()) {
  if (actor.isPlatform) throw new DomainError("Platform accounts don't send feedback.", "FORBIDDEN");
  const data = feedbackInput.parse(input);
  const message = data.message.trim();
  assertRule(canSendFeedback({ message, rating: data.rating }, sentLastHour(actor.id, now.getTime())));
  const role = await roleKindOf(db, actor);
  await db.feedback.create({
    data: { message, rating: data.rating, path: routeTemplate(data.path) ?? "/", role, version: appVersion(), createdAt: startOfHour(now) },
  });
  sent.get(actor.id)!.push(now.getTime());
}

export const FEEDBACK_STATUSES: FeedbackStatus[] = ["NEW", "TRIAGED", "DONE"];

export async function listFeedback(actor: Actor, opts: { status?: FeedbackStatus; page?: number } = {}) {
  assertPlatform(actor);
  const take = 50;
  const page = Math.max(0, Math.floor(opts.page ?? 0));
  const rows = await db.feedback.findMany({
    where: { status: opts.status },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: page * take,
    take: take + 1,
  });
  const counts = await db.feedback.groupBy({ by: ["status"], _count: true });
  return {
    items: rows.slice(0, take),
    more: rows.length > take,
    counts: Object.fromEntries(FEEDBACK_STATUSES.map((s) => [s, counts.find((c) => c.status === s)?._count ?? 0])) as Record<FeedbackStatus, number>,
  };
}

export async function setFeedbackStatus(actor: Actor, id: string, status: FeedbackStatus) {
  assertPlatform(actor);
  if (!FEEDBACK_STATUSES.includes(status)) throw new DomainError("Unknown status.");
  return db.$transaction(async (tx) => {
    const before = await tx.feedback.findUnique({ where: { id }, select: { status: true } });
    if (!before) throw new DomainError("Feedback not found.", "NOT_FOUND");
    if (before.status === status) return;
    await tx.feedback.update({ where: { id }, data: { status } });
    // Recorded under platform.*, which the admin audit log leaves out.
    await audit(tx, actor, { action: "platform.feedback_status", entityType: "Feedback", entityId: id, before, after: { status } });
  });
}

// ─── One-question surveys ────────────────────────────────────────────────────

/**
 * Called after a booking, reschedule or mark submission succeeds: should the
 * person be asked the survey now? Records that they were asked, so the next
 * prompt waits (see `canPromptSurvey`) whether or not they answer. Admins are never asked.
 */
export async function claimSurvey(actor: Actor, prompt: SurveyPromptId, now = new Date()): Promise<boolean> {
  if (actor.isAdmin || actor.isPlatform) return false;
  try {
    const [last, lastAny] = await Promise.all([
      db.surveyPrompt.findUnique({ where: { userId_prompt: { userId: actor.id, prompt } } }),
      db.surveyPrompt.findFirst({ where: { userId: actor.id }, orderBy: { shownAt: "desc" } }),
    ]);
    if (!canPromptSurvey(last, now, lastAny).ok) return false;
    await db.surveyPrompt.upsert({
      where: { userId_prompt: { userId: actor.id, prompt } },
      create: { userId: actor.id, prompt, shownAt: now },
      update: { shownAt: now, answered: false },
    });
    return true;
  } catch (err) {
    // The booking or submission already succeeded; a survey problem must not turn it into an error.
    console.error("[survey] could not claim prompt", err instanceof Error ? err.message : err);
    return false;
  }
}

/** Answer (1–5) or dismiss (null) a survey the person was just shown. The response is stored without the user. */
export async function answerSurvey(actor: Actor, prompt: SurveyPromptId, score: number | null, now = new Date()) {
  assertRule(validScore(score));
  const role = await roleKindOf(db, actor);
  await db.$transaction(async (tx) => {
    const state = await tx.surveyPrompt.findUnique({ where: { userId_prompt: { userId: actor.id, prompt } } });
    assertRule(canAnswerSurvey(state, now), "CONFLICT");
    // Conditional claim: a double click can't record two answers.
    const { count } = await tx.surveyPrompt.updateMany({ where: { userId: actor.id, prompt, answered: false }, data: { answered: true } });
    if (count === 0) throw new DomainError("You've already answered this.", "CONFLICT");
    await tx.surveyResponse.create({ data: { prompt, score, role, version: appVersion(), createdAt: startOfUtcDay(now) } });
  });
}
