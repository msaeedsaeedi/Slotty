/**
 * Background worker. Run alongside the web app with `bun run worker`.
 *
 * Two loops:
 * - delivery: sends queued emails and push messages. It wakes as soon as a
 *   transaction that queued something commits (Postgres LISTEN/NOTIFY, see
 *   `signalOutbox`), with a slow poll as a backstop. Where notifications don't
 *   arrive (e.g. behind a transaction-mode pooler such as PgBouncer), it polls
 *   every WORKER_INTERVAL_MS instead.
 * - schedule: time-based jobs (booking opens, nudges, auto-close, agendas,
 *   reminders) every WORKER_SCHEDULE_MS.
 *
 * Every job claims its rows with a conditional update, so a second worker would
 * share the work rather than duplicate it. Delivery is at-least-once: a crash
 * between sending and recording it resends that one message.
 */
import "dotenv/config";
import { Client } from "pg";
import { db } from "@/server/db";
import { closeMailer, deliverPendingEmails } from "@/server/mailer";
import { OUTBOX_CHANNEL } from "@/server/outbox-signal";
import { deliverPendingPush } from "@/server/push";
import { isPushConfigured } from "@/server/push-config";
import { announceOpenedBookings, closeEndedAssignments, nudgeUnbookedStudents, sendDailyAgendas } from "@/server/services/automations";
import { queueDueReminders } from "@/server/services/reminders";

const POLL_MS = Number(process.env.WORKER_INTERVAL_MS ?? 15_000);
const BACKSTOP_MS = 60_000;
const SCHEDULE_MS = Number(process.env.WORKER_SCHEDULE_MS ?? 60_000);
const EMAIL_BATCH = 50;
const PUSH_BATCH = 100;
/** Batches per wake-up before yielding, so a huge backlog can't starve shutdown. */
const MAX_ROUNDS = 20;
/** Docker's stop_grace_period for the worker is longer than this. */
const SHUTDOWN_TIMEOUT_MS = 25_000;

let stopping = false;
let listening = false;

const log = (msg: string) => console.log(`[worker] ${new Date().toISOString()} ${msg}`);

/** A sleep that can be cut short. A wake-up while the loop is busy isn't lost: the next wait returns at once. */
function wakeable() {
  let pending = false;
  let finish: (() => void) | null = null;
  return {
    wake() {
      if (finish) finish();
      else pending = true;
    },
    wait(ms: number) {
      if (pending) {
        pending = false;
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        const timer = setTimeout(done, ms);
        function done() {
          clearTimeout(timer);
          finish = null;
          resolve();
        }
        finish = done;
      });
    },
  };
}

const delivery = wakeable();
const schedule = wakeable();

/** Run one job; a failure is logged and doesn't stop the other jobs. */
async function job<T>(name: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[worker] ${name} failed`, err);
    return undefined;
  }
}

function report(counts: Record<string, number | undefined>) {
  const shown = Object.entries(counts).filter(([, v]) => v);
  if (shown.length) log(shown.map(([k, v]) => `${k}=${v}`).join(" "));
}

async function deliveryLoop() {
  while (!stopping) {
    for (let round = 0; round < MAX_ROUNDS && !stopping; round++) {
      const email = await job("email", () => deliverPendingEmails(EMAIL_BATCH));
      const push = await job("push", () => deliverPendingPush(PUSH_BATCH));
      report({ sent: email?.sent, failed: email?.failed, pushed: push?.sent, pushFailed: push?.failed });
      if (email?.fetched !== EMAIL_BATCH && push?.fetched !== PUSH_BATCH) break;
    }
    await delivery.wait(listening ? BACKSTOP_MS : POLL_MS);
  }
}

async function scheduleLoop() {
  while (!stopping) {
    const counts = {
      opened: await job("announce-open", () => announceOpenedBookings()),
      nudged: await job("nudge-unbooked", () => nudgeUnbookedStudents()),
      closed: await job("auto-close", () => closeEndedAssignments()),
      agendas: await job("agendas", () => sendDailyAgendas()),
      reminders: await job("reminders", () => queueDueReminders()),
    };
    report(counts);
    // Deliver what was just queued without waiting for the next poll (NOTIFY also does this when available).
    if (Object.values(counts).some(Boolean)) delivery.wake();
    await schedule.wait(SCHEDULE_MS);
  }
}

// ─── LISTEN/NOTIFY ───────────────────────────────────────────────────────────

let listener: Client | null = null;
let retryMs = 5_000;

/**
 * Open a dedicated connection that LISTENs for outbox signals, and check that a
 * test notification actually arrives. If it doesn't, stay on polling.
 */
async function startListener(): Promise<boolean> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    await client.query(`LISTEN ${OUTBOX_CHANNEL}`);
    const arrived = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 3_000);
      client.once("notification", () => {
        clearTimeout(timer);
        resolve(true);
      });
    });
    await db.$executeRaw`SELECT pg_notify(${OUTBOX_CHANNEL}, 'probe')`;
    if (!(await arrived)) {
      await client.end().catch(() => {});
      return false;
    }
  } catch (err) {
    console.error("[worker] LISTEN unavailable", err instanceof Error ? err.message : err);
    await client.end().catch(() => {});
    return false;
  }

  client.on("notification", () => delivery.wake());
  const lost = (err?: Error) => {
    if (listener !== client) return;
    listener = null;
    listening = false;
    client.end().catch(() => {});
    if (stopping) return;
    log(`lost LISTEN connection${err ? ` (${err.message})` : ""}; polling every ${POLL_MS / 1000}s and reconnecting`);
    delivery.wake();
    setTimeout(reconnect, retryMs);
    retryMs = Math.min(retryMs * 2, 60_000);
  };
  client.on("error", lost);
  client.on("end", () => lost());
  listener = client;
  listening = true;
  retryMs = 5_000;
  return true;
}

async function reconnect() {
  if (stopping || listener) return;
  if (await startListener()) log("LISTEN reconnected");
  else setTimeout(reconnect, retryMs);
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

let loops: Promise<unknown> = Promise.resolve();

async function main() {
  const listenOk = await startListener();
  log(
    `started: delivery ${listenOk ? `on notify (backstop ${BACKSTOP_MS / 1000}s)` : `polling every ${POLL_MS / 1000}s`}, ` +
      `schedule every ${SCHEDULE_MS / 1000}s, SMTP ${process.env.SMTP_HOST ? "on" : "off — printing emails"}, push ${isPushConfigured() ? "on" : "off"}`,
  );
  loops = Promise.all([deliveryLoop(), scheduleLoop()]);
  await loops;
}

/** Finish the batch in progress (so nothing is sent twice after a restart), then exit. */
async function shutdown(signal: string) {
  if (stopping) {
    log(`${signal} again: exiting now`);
    process.exit(1);
  }
  stopping = true;
  log(`${signal}: finishing current work`);
  setTimeout(() => {
    console.error("[worker] shutdown timed out");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();
  delivery.wake();
  schedule.wake();
  await loops.catch(() => {});
  await listener?.end().catch(() => {});
  closeMailer();
  await db.$disconnect();
  process.exit(0);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => void shutdown(signal));

main().catch((err) => {
  console.error("[worker] crashed", err);
  process.exit(1);
});
