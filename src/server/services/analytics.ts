import { Prisma } from "@/generated/prisma/client";
import {
  allowedWithoutConsent,
  batchSchema,
  clientEventSchema,
  deviceClass,
  eventTime,
  retentionCutoffs,
  roleKind,
  routeTemplate,
  scrubErrorMessage,
  type RoleKind,
} from "@/domain/analytics";
import { analyticsEnabled, appVersion, pseudonym } from "@/server/analytics-config";
import { db, type Tx } from "@/server/db";
import type { Actor } from "./access";

/** The actor's role for analytics: student, staff, both, admin (or none). */
export async function roleKindOf(tx: Tx, actor: Actor): Promise<RoleKind> {
  if (actor.isAdmin) return "admin";
  const roles = await tx.enrollment.findMany({ where: { userId: actor.id }, select: { role: true }, distinct: ["role"] });
  return roleKind({ isAdmin: false, staff: roles.some((r) => r.role !== "STUDENT"), student: roles.some((r) => r.role === "STUDENT") });
}

// ─── Ingest ──────────────────────────────────────────────────────────────────

/** Events per user per minute, per web process (best effort, nothing stored). */
const PER_MINUTE = 240;
const recent = new Map<string, { windowStart: number; count: number }>();

function withinRate(userId: string, n: number, now: number): number {
  const entry = recent.get(userId);
  if (!entry || now - entry.windowStart > 60_000) {
    if (recent.size > 10_000) recent.clear();
    recent.set(userId, { windowStart: now, count: n });
    return Math.min(n, PER_MINUTE);
  }
  const room = Math.max(0, PER_MINUTE - entry.count);
  entry.count += n;
  return Math.min(n, room);
}

/**
 * Store a batch from the browser tracker. Invalid events are dropped one by
 * one; nothing is stored when analytics is off. People who turned usage data
 * off still report errors, with no visitor key. Returns how many were stored.
 */
export async function recordEvents(actor: Actor, input: unknown, ctx: { userAgent?: string | null; now?: Date } = {}): Promise<number> {
  // The product team's own browsing would only skew the numbers it reads.
  if (!analyticsEnabled() || actor.isPlatform) return 0;
  const now = ctx.now ?? new Date();
  const batch = batchSchema.safeParse(input);
  if (!batch.success) return 0;

  const user = await db.user.findUnique({ where: { id: actor.id }, select: { shareUsageData: true, status: true } });
  if (!user || user.status !== "ACTIVE") return 0;
  const share = user.shareUsageData;
  const role = await roleKindOf(db, actor);
  const device = deviceClass(ctx.userAgent);
  const version = appVersion();
  const visitor = share ? pseudonym(actor.id) : null;

  const rows: Prisma.AnalyticsEventCreateManyInput[] = [];
  for (const raw of batch.data.events) {
    const parsed = clientEventSchema.safeParse(raw);
    if (!parsed.success) continue;
    const event = parsed.data;
    if (!share && !allowedWithoutConsent(event.name)) continue;
    const path = routeTemplate(event.path);
    if (!path) continue;
    let props: Prisma.InputJsonValue | undefined;
    if (event.name === "client_error") {
      props = { kind: event.props.kind, message: scrubErrorMessage(event.props.message), ...(event.props.digest ? { digest: event.props.digest.replace(/[^\w-]/g, "") } : {}) };
    } else if ("props" in event) {
      props = event.props;
    }
    rows.push({
      occurredAt: eventTime(event.at, now),
      name: event.name,
      visitor: event.name === "client_error" && !share ? null : visitor,
      sessionId: batch.data.sessionId,
      role,
      path,
      device,
      version,
      props,
    });
  }
  const allowed = withinRate(actor.id, rows.length, now.getTime());
  if (allowed === 0) return 0;
  const { count } = await db.analyticsEvent.createMany({ data: rows.slice(0, allowed) });
  return count;
}

// ─── Rollup and retention (worker) ───────────────────────────────────────────

/** How many past days the rollup recomputes, so late events and worker downtime are covered. */
const ROLLUP_DAYS = 7;

/**
 * Fold raw events into daily totals for the last ROLLUP_DAYS full days, then
 * delete raw events past 90 days and totals past 13 months. Idempotent.
 */
export async function rollupAndPrune(now = new Date()) {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const from = new Date(today.getTime() - ROLLUP_DAYS * 86_400_000);
  // Funnel, feature and vital events are split by their kind so each has its own total.
  const rolled = await db.$executeRaw`
    INSERT INTO "AnalyticsDaily" ("day", "name", "path", "role", "device", "events", "visitors", "p75")
    SELECT date_trunc('day', "occurredAt")::date,
           CASE "name"
             WHEN 'web_vital' THEN 'web_vital.' || ("props"->>'metric')
             WHEN 'funnel' THEN 'funnel.' || ("props"->>'flow') || '.' || ("props"->>'step')
             WHEN 'feature' THEN 'feature.' || ("props"->>'feature')
             ELSE "name"
           END AS n,
           "path", "role", "device",
           count(*)::int, count(DISTINCT "visitor")::int,
           percentile_cont(0.75) WITHIN GROUP (ORDER BY ("props"->>'value')::float8) FILTER (WHERE "name" = 'web_vital')
    FROM "AnalyticsEvent"
    WHERE "occurredAt" >= ${from} AND "occurredAt" < ${today}
    GROUP BY 1, 2, 3, 4, 5
    UNION ALL
    -- One row per day with that day's unique visitors across everything, for the long-term trend.
    SELECT date_trunc('day', "occurredAt")::date, 'visitors', '*', '*', '*', count(*)::int, count(DISTINCT "visitor")::int, NULL
    FROM "AnalyticsEvent"
    WHERE "occurredAt" >= ${from} AND "occurredAt" < ${today}
    GROUP BY 1
    ON CONFLICT ("day", "name", "path", "role", "device")
    DO UPDATE SET "events" = EXCLUDED."events", "visitors" = EXCLUDED."visitors", "p75" = EXCLUDED."p75"`;
  const cut = retentionCutoffs(now);
  const [raw, daily] = await Promise.all([
    db.analyticsEvent.deleteMany({ where: { occurredAt: { lt: cut.raw } } }),
    db.analyticsDaily.deleteMany({ where: { day: { lt: cut.rollup } } }),
  ]);
  return { rolled, prunedRaw: raw.count, prunedDaily: daily.count };
}
