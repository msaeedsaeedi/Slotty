import { z } from "zod";
import { allow, deny, type RuleResult } from "./result";

/**
 * Usage analytics and feedback rules (docs chapter 4, "Usage data").
 *
 * The client may only send the events in this catalog; anything else is
 * dropped. Events never carry free text, except a scrubbed error message.
 */

const DAY = 86_400_000;

/** Raw events are deleted after this many days. */
export const RAW_RETENTION_DAYS = 90;
/** Daily totals are kept about 13 months, so one semester can be compared with the next. */
export const ROLLUP_RETENTION_DAYS = 400;
/** A survey prompt is shown to the same person at most once in this many days. */
/** The same survey is asked at most once per person in this many days (about a term). */
export const SURVEY_INTERVAL_DAYS = 90;
/** And at most one survey of any kind per person in this many days, so one demo never brings two. */
export const SURVEY_ANY_INTERVAL_DAYS = 14;
/** An answer is accepted only this long after the prompt was shown. */
export const SURVEY_ANSWER_HOURS = 24;
/** Feedback messages per person per hour (best effort, kept in memory). */
export const FEEDBACK_PER_HOUR = 5;
export const FEEDBACK_MAX_LENGTH = 2000;
/** Most events accepted in one request. */
export const MAX_BATCH = 50;

export const FLOWS = ["booking", "reschedule", "marking"] as const;
export type Flow = (typeof FLOWS)[number];
export const FLOW_STEPS = ["view", "submit", "done", "error"] as const;
export type FlowStep = (typeof FLOW_STEPS)[number];

export const FEATURES = ["add_to_calendar", "push_enabled", "app_installed", "feedback_opened"] as const;
export type Feature = (typeof FEATURES)[number];

export const VITALS = ["LCP", "INP", "CLS", "FCP", "TTFB"] as const;
export type Vital = (typeof VITALS)[number];

export const SURVEY_PROMPTS = {
  booking: "How easy was it to book your demo?",
  reschedule: "How easy was it to move your demo?",
  marking: "How easy was it to mark and submit?",
} as const;
export type SurveyPromptId = keyof typeof SURVEY_PROMPTS;
export const isSurveyPrompt = (v: unknown): v is SurveyPromptId => typeof v === "string" && Object.hasOwn(SURVEY_PROMPTS, v);

export type RoleKind = "student" | "staff" | "both" | "admin" | "none";

const base = { path: z.string().max(300), at: z.number().int().nonnegative() };

export const clientEventSchema = z.discriminatedUnion("name", [
  z.object({ ...base, name: z.literal("page_view") }),
  z.object({
    ...base,
    name: z.literal("web_vital"),
    props: z.object({
      metric: z.enum(VITALS),
      value: z.number().finite().min(0).max(600_000),
      rating: z.enum(["good", "needs-improvement", "poor"]),
    }),
  }),
  z.object({
    ...base,
    name: z.literal("client_error"),
    props: z.object({
      kind: z.enum(["error", "rejection", "boundary", "csp"]),
      message: z.string().max(1000),
      digest: z.string().max(64).optional(),
    }),
  }),
  z.object({ ...base, name: z.literal("funnel"), props: z.object({ flow: z.enum(FLOWS), step: z.enum(FLOW_STEPS) }) }),
  z.object({ ...base, name: z.literal("feature"), props: z.object({ feature: z.enum(FEATURES) }) }),
]);
export type ClientEvent = z.infer<typeof clientEventSchema>;
export type EventName = ClientEvent["name"];

export const batchSchema = z.object({
  sessionId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  events: z.array(z.unknown()).max(MAX_BATCH),
});

/** Segments that are words, not ids, even though they're long. */
const WORDS = /^[a-z]+(-[a-z]+)*$/;

/**
 * The route template for a path: `/courses/ckx…/assignments/ckz…?x=1` becomes
 * `/courses/:id/assignments/:id`. Anything that looks like an id or token
 * becomes `:id`, so no record id or secret is ever stored. Returns null for
 * something that isn't a plain app path.
 */
export function routeTemplate(path: string): string | null {
  const clean = path.split(/[?#]/)[0];
  if (!clean.startsWith("/") || clean.startsWith("//") || clean.length > 300) return null;
  const segments = clean.split("/").filter(Boolean);
  if (segments.length > 12) return null;
  const out: string[] = [];
  for (const raw of segments) {
    let seg: string;
    try {
      seg = decodeURIComponent(raw);
    } catch {
      return null;
    }
    if (seg === ":id") out.push(seg);
    else if (WORDS.test(seg) && seg.length <= 24) out.push(seg);
    else if (/^\d{1,3}$/.test(seg)) out.push(seg); // e.g. /icons/192
    else out.push(":id");
  }
  return "/" + out.join("/");
}

/** mobile, tablet or desktop, from the user agent (the agent itself is never stored). */
export function deviceClass(userAgent: string | null | undefined): "mobile" | "tablet" | "desktop" {
  const ua = userAgent ?? "";
  if (/iPad|Tablet|PlayBook|Silk|Android(?!.*Mobile)/i.test(ua)) return "tablet";
  if (/Mobi|iPhone|iPod|Android|IEMobile|Opera Mini/i.test(ua)) return "mobile";
  return "desktop";
}

/**
 * An error message with anything that could identify someone removed: emails,
 * URLs, long numbers and token-like strings. Kept short.
 */
export function scrubErrorMessage(message: string): string {
  return message
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "<email>")
    .replace(/\b(?:https?|wss?):\/\/\S+/gi, "<url>")
    .replace(/\b[A-Za-z0-9_-]{16,}\b/g, (m) => (/\d/.test(m) ? "<id>" : m))
    .replace(/\d{4,}/g, "<n>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

/** A client timestamp, trusted only within the last hour (else the server's time). */
export function eventTime(clientMs: number, now: Date): Date {
  const t = clientMs;
  return t <= now.getTime() && t >= now.getTime() - 3_600_000 ? new Date(t) : now;
}

/** Someone who turned "Share usage data" off still reports errors, without their pseudonym. */
export function allowedWithoutConsent(name: EventName): boolean {
  return name === "client_error";
}

export function roleKind(u: { isAdmin: boolean; staff: boolean; student: boolean }): RoleKind {
  if (u.isAdmin) return "admin";
  if (u.staff && u.student) return "both";
  if (u.staff) return "staff";
  if (u.student) return "student";
  return "none";
}

/**
 * May this person be asked this survey now? Each survey at most once per
 * SURVEY_INTERVAL_DAYS, and no survey at all within SURVEY_ANY_INTERVAL_DAYS of
 * any other one, whether or not they answered. `lastAny` is their most recent
 * prompt of any kind.
 */
export function canPromptSurvey(last: { shownAt: Date } | null, now: Date, lastAny: { shownAt: Date } | null = last): RuleResult {
  if (last && now.getTime() < last.shownAt.getTime() + SURVEY_INTERVAL_DAYS * DAY) return deny("You were asked this recently.");
  if (lastAny && now.getTime() < lastAny.shownAt.getTime() + SURVEY_ANY_INTERVAL_DAYS * DAY) return deny("You were asked for feedback recently.");
  return allow;
}

/** An answer counts only for a prompt that was shown recently and not answered yet. */
export function canAnswerSurvey(state: { shownAt: Date; answered: boolean } | null, now: Date): RuleResult {
  if (!state) return deny("There's no survey to answer.");
  if (state.answered) return deny("You've already answered this.");
  if (now.getTime() - state.shownAt.getTime() > SURVEY_ANSWER_HOURS * 3_600_000) return deny("This survey has expired.");
  return allow;
}

export function validScore(score: number | null): RuleResult {
  return score === null || (Number.isInteger(score) && score >= 1 && score <= 5) ? allow : deny("Pick a score from 1 to 5.");
}

/** Feedback: a message is required, an optional 1–5 rating, and a per-hour limit. */
export function canSendFeedback(input: { message: string; rating: number | null }, sentLastHour: number): RuleResult {
  if (!input.message.trim()) return deny("Write a few words so we know what to improve.");
  if (input.message.length > FEEDBACK_MAX_LENGTH) return deny(`Keep it under ${FEEDBACK_MAX_LENGTH} characters.`);
  const score = validScore(input.rating);
  if (!score.ok) return score;
  if (sentLastHour >= FEEDBACK_PER_HOUR) return deny("Thanks — you've sent a lot of feedback this hour. Please try again later.");
  return allow;
}

/** Times stored on anonymous records are coarsened so they can't be lined up with usage events. */
export const startOfHour = (d: Date) => new Date(Math.floor(d.getTime() / 3_600_000) * 3_600_000);
export const startOfUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/** Day boundaries for retention, in UTC. */
export function retentionCutoffs(now: Date) {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return {
    raw: new Date(today - RAW_RETENTION_DAYS * DAY),
    rollup: new Date(today - ROLLUP_RETENTION_DAYS * DAY),
  };
}
