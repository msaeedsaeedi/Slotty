import { FLOW_STEPS, FLOWS, SURVEY_PROMPTS, VITALS, type Flow, type FlowStep, type Vital } from "@/domain/analytics";
import { db } from "@/server/db";
import { assertAdmin, type Actor } from "./access";

/**
 * Admin reports for /admin/insights (docs chapter 3, "Usage insights"). Raw
 * events cover the last 90 days; the monthly trend reads the daily totals.
 * Workflow numbers come from the booking and marking tables, not from events.
 */

const DAY = 86_400_000;
export const RANGES = [7, 30, 90] as const;
export type RangeDays = (typeof RANGES)[number];
const since = (days: number, now: Date) => new Date(now.getTime() - days * DAY);

// ─── Overview ────────────────────────────────────────────────────────────────

export async function usageOverview(actor: Actor, days: RangeDays, now = new Date()) {
  assertAdmin(actor);
  const from = since(days, now);
  const week = since(7, now);
  const [activeWeek, totals, daily, pages, features, trend] = await Promise.all([
    db.$queryRaw<{ role: string; visitors: number }[]>`
      SELECT "role", count(DISTINCT "visitor")::int AS visitors FROM "AnalyticsEvent"
      WHERE "occurredAt" >= ${week} AND "visitor" IS NOT NULL GROUP BY 1 ORDER BY 2 DESC`,
    db.$queryRaw<{ visitors: number; sessions: number; views: number }[]>`
      SELECT count(DISTINCT "visitor")::int AS visitors, count(DISTINCT "sessionId")::int AS sessions,
             (count(*) FILTER (WHERE "name" = 'page_view'))::int AS views
      FROM "AnalyticsEvent" WHERE "occurredAt" >= ${from}`,
    db.$queryRaw<{ day: Date; visitors: number }[]>`
      SELECT date_trunc('day', "occurredAt") AS day, count(DISTINCT "visitor")::int AS visitors FROM "AnalyticsEvent"
      WHERE "occurredAt" >= ${from} AND "visitor" IS NOT NULL GROUP BY 1 ORDER BY 1`,
    db.$queryRaw<{ path: string; views: number; visitors: number; roles: string[] }[]>`
      SELECT "path", count(*)::int AS views, count(DISTINCT "visitor")::int AS visitors, array_agg(DISTINCT "role") AS roles
      FROM "AnalyticsEvent" WHERE "name" = 'page_view' AND "occurredAt" >= ${from}
      GROUP BY 1 ORDER BY 2 DESC`,
    db.$queryRaw<{ feature: string; role: string; uses: number; visitors: number }[]>`
      SELECT "props"->>'feature' AS feature, "role", count(*)::int AS uses, count(DISTINCT "visitor")::int AS visitors
      FROM "AnalyticsEvent" WHERE "name" = 'feature' AND "occurredAt" >= ${from} GROUP BY 1, 2 ORDER BY 3 DESC`,
    // Months from the daily totals (13 months): page views, and the average of each day's unique visitors.
    db.$queryRaw<{ month: Date; views: number; avgDaily: number }[]>`
      SELECT date_trunc('month', "day") AS month,
             (sum("events") FILTER (WHERE "name" = 'page_view'))::int AS views,
             round(avg("visitors") FILTER (WHERE "name" = 'visitors'))::int AS "avgDaily"
      FROM "AnalyticsDaily" WHERE "name" IN ('page_view', 'visitors')
      GROUP BY 1 ORDER BY 1`,
  ]);
  return { activeWeek, totals: totals[0] ?? { visitors: 0, sessions: 0, views: 0 }, daily, pages, features, trend };
}

// ─── Funnels ─────────────────────────────────────────────────────────────────

export type FunnelRow = { flow: Flow; device: string; counts: Record<FlowStep, number> };

/** Distinct visits (browser tabs) reaching each step of each flow, by device. */
export async function funnels(actor: Actor, days: RangeDays, now = new Date()) {
  assertAdmin(actor);
  const rows = await db.$queryRaw<{ flow: Flow; step: FlowStep; device: string; sessions: number }[]>`
    SELECT "props"->>'flow' AS flow, "props"->>'step' AS step, "device", count(DISTINCT "sessionId")::int AS sessions
    FROM "AnalyticsEvent" WHERE "name" = 'funnel' AND "occurredAt" >= ${since(days, now)} GROUP BY 1, 2, 3`;
  const out: FunnelRow[] = [];
  for (const flow of FLOWS) {
    for (const device of ["all", "mobile", "desktop", "tablet"]) {
      const counts = Object.fromEntries(
        FLOW_STEPS.map((step) => [step, rows.filter((r) => r.flow === flow && r.step === step && (device === "all" || r.device === device)).reduce((a, r) => a + r.sessions, 0)]),
      ) as Record<FlowStep, number>;
      if (device === "all" || counts.view + counts.submit > 0) out.push({ flow, device, counts });
    }
  }
  return out;
}

// ─── Performance ─────────────────────────────────────────────────────────────

/** Core Web Vitals "good" thresholds (web.dev), in ms except CLS. */
export const VITAL_GOOD: Record<Vital, number> = { LCP: 2500, INP: 200, CLS: 0.1, FCP: 1800, TTFB: 800 };

export async function performance(actor: Actor, days: RangeDays, now = new Date()) {
  assertAdmin(actor);
  const from = since(days, now);
  const [byDevice, slowRoutes] = await Promise.all([
    db.$queryRaw<{ metric: Vital; device: string; samples: number; p75: number; good: number }[]>`
      SELECT "props"->>'metric' AS metric, "device", count(*)::int AS samples,
             percentile_cont(0.75) WITHIN GROUP (ORDER BY ("props"->>'value')::float8) AS p75,
             (count(*) FILTER (WHERE "props"->>'rating' = 'good'))::int AS good
      FROM "AnalyticsEvent" WHERE "name" = 'web_vital' AND "occurredAt" >= ${from} GROUP BY 1, 2 ORDER BY 1, 2`,
    db.$queryRaw<{ path: string; device: string; samples: number; p75: number }[]>`
      SELECT "path", "device", count(*)::int AS samples,
             percentile_cont(0.75) WITHIN GROUP (ORDER BY ("props"->>'value')::float8) AS p75
      FROM "AnalyticsEvent" WHERE "name" = 'web_vital' AND "props"->>'metric' = 'LCP' AND "occurredAt" >= ${from}
      GROUP BY 1, 2 HAVING count(*) >= 5 ORDER BY 4 DESC LIMIT 15`,
  ]);
  return { byDevice: byDevice.filter((r) => VITALS.includes(r.metric)), slowRoutes };
}

// ─── Errors ──────────────────────────────────────────────────────────────────

export async function clientErrors(actor: Actor, days: RangeDays, now = new Date()) {
  assertAdmin(actor);
  return db.$queryRaw<{ kind: string; message: string; paths: string[]; versions: string[]; count: number; sessions: number; lastSeen: Date }[]>`
    SELECT "props"->>'kind' AS kind, "props"->>'message' AS message,
           (array_agg(DISTINCT "path"))[1:5] AS paths, (array_agg(DISTINCT "version"))[1:5] AS versions,
           count(*)::int AS count, count(DISTINCT "sessionId")::int AS sessions, max("occurredAt") AS "lastSeen"
    FROM "AnalyticsEvent" WHERE "name" = 'client_error' AND "occurredAt" >= ${since(days, now)}
    GROUP BY 1, 2 ORDER BY 5 DESC LIMIT 50`;
}

// ─── Surveys ─────────────────────────────────────────────────────────────────

export async function surveys(actor: Actor, days: RangeDays, now = new Date()) {
  assertAdmin(actor);
  const from = since(days, now);
  const [responses, shown] = await Promise.all([
    db.$queryRaw<{ prompt: string; role: string; score: number | null; n: number }[]>`
      SELECT "prompt", "role", "score", count(*)::int AS n FROM "SurveyResponse" WHERE "createdAt" >= ${from} GROUP BY 1, 2, 3`,
    db.surveyPrompt.groupBy({ by: ["prompt"], _count: true, where: { shownAt: { gte: from } } }),
  ]);
  return (Object.keys(SURVEY_PROMPTS) as (keyof typeof SURVEY_PROMPTS)[]).map((prompt) => {
    const rows = responses.filter((r) => r.prompt === prompt);
    const answered = rows.filter((r) => r.score !== null);
    const total = answered.reduce((a, r) => a + r.n, 0);
    const distribution = [1, 2, 3, 4, 5].map((s) => answered.filter((r) => r.score === s).reduce((a, r) => a + r.n, 0));
    return {
      prompt,
      question: SURVEY_PROMPTS[prompt],
      shown: shown.find((s) => s.prompt === prompt)?._count ?? 0,
      answered: total,
      dismissed: rows.filter((r) => r.score === null).reduce((a, r) => a + r.n, 0),
      average: total ? answered.reduce((a, r) => a + r.score! * r.n, 0) / total : null,
      distribution,
    };
  });
}

// ─── Workflow numbers (from the tables Slotty already keeps) ─────────────────

/**
 * What people actually did, from bookings, requests, the waitlist and marks.
 * A reschedule is stored as a self-cancellation plus a new booking created at
 * the same moment; a "cancel then rebook" is a new booking 5 s – 30 min later.
 */
export async function workflowMetrics(actor: Actor, days: RangeDays, now = new Date()) {
  assertAdmin(actor);
  const from = since(days, now);
  const [changes, bookings, requests, waitlist, marking, audits] = await Promise.all([
    db.$queryRaw<{ reschedules: number; cancellations: number; quickRebooks: number; staffCancels: number }[]>`
      WITH c AS (
        SELECT b."id", b."cancelledAt", b."cancelledById" = b."studentId" AS self,
               (SELECT min(n."createdAt") FROM "Booking" n
                 WHERE n."studentId" = b."studentId" AND n."assignmentId" = b."assignmentId"
                   AND n."createdAt" > b."createdAt" AND n."createdAt" >= b."cancelledAt" - interval '5 seconds') AS next_at
        FROM "Booking" b WHERE b."status" = 'CANCELLED' AND b."cancelledAt" >= ${from}
      )
      SELECT (count(*) FILTER (WHERE self AND next_at <= "cancelledAt" + interval '5 seconds'))::int AS reschedules,
             (count(*) FILTER (WHERE self AND (next_at IS NULL OR next_at > "cancelledAt" + interval '5 seconds')))::int AS cancellations,
             (count(*) FILTER (WHERE self AND next_at > "cancelledAt" + interval '5 seconds' AND next_at <= "cancelledAt" + interval '30 minutes'))::int AS "quickRebooks",
             (count(*) FILTER (WHERE NOT self))::int AS "staffCancels"
      FROM c`,
    db.$queryRaw<{ created: number; demos: number; noShows: number }[]>`
      SELECT (SELECT count(*) FROM "Booking" WHERE "createdAt" >= ${from})::int AS created,
             (count(*) FILTER (WHERE b."status" IN ('COMPLETED', 'NO_SHOW')))::int AS demos,
             (count(*) FILTER (WHERE b."status" = 'NO_SHOW'))::int AS "noShows"
      FROM "Booking" b JOIN "Slot" s ON s."id" = b."slotId"
      WHERE s."startsAt" >= ${from} AND s."startsAt" < ${now}`,
    db.$queryRaw<{ kind: string; total: number; declined: number; open: number; medianHours: number | null }[]>`
      SELECT "kind", count(*)::int AS total, (count(*) FILTER (WHERE "status" = 'DECLINED'))::int AS declined,
             (count(*) FILTER (WHERE "status" = 'OPEN'))::int AS open,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM "resolvedAt" - "createdAt") / 3600) AS "medianHours"
      FROM "StudentRequest" WHERE "createdAt" >= ${from} GROUP BY 1`,
    db.$queryRaw<{ joined: number; booked: number }[]>`
      SELECT count(*)::int AS joined,
             (count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "Booking" b WHERE b."studentId" = w."studentId"
               AND b."assignmentId" = w."assignmentId" AND b."createdAt" > w."createdAt")))::int AS booked
      FROM "WaitlistEntry" w WHERE w."createdAt" >= ${from}`,
    db.$queryRaw<{ submitted: number; medianHours: number | null; p90Hours: number | null }[]>`
      SELECT count(*)::int AS submitted,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM e."submittedAt" - s."endsAt") / 3600) AS "medianHours",
             percentile_cont(0.9) WITHIN GROUP (ORDER BY extract(epoch FROM e."submittedAt" - s."endsAt") / 3600) AS "p90Hours"
      FROM "Evaluation" e JOIN "Booking" b ON b."id" = e."bookingId" JOIN "Slot" s ON s."id" = b."slotId"
      WHERE e."submittedAt" >= ${from}`,
    db.auditLog.groupBy({
      by: ["action"],
      _count: true,
      where: { createdAt: { gte: from }, action: { in: ["evaluation.unlock", "evaluation.early", "evaluation.no_booking", "booking.staff_place"] } },
    }),
  ]);
  const audit = (a: string) => audits.find((r) => r.action === a)?._count ?? 0;
  const req = (k: string) => requests.find((r) => r.kind === k) ?? { total: 0, declined: 0, open: 0, medianHours: null };
  return {
    changes: changes[0],
    bookings: bookings[0],
    bookingRequests: req("BOOKING_CHANGE"),
    markQueries: req("MARK_QUERY"),
    waitlist: waitlist[0],
    marking: { ...marking[0], unlocks: audit("evaluation.unlock"), early: audit("evaluation.early"), noBooking: audit("evaluation.no_booking") },
    staffPlacements: audit("booking.staff_place"),
  };
}
