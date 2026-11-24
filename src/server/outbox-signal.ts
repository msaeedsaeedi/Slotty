import type { Tx } from "@/server/db";

/** Postgres channel the worker LISTENs on to deliver queued emails and pushes right away. */
export const OUTBOX_CHANNEL = "uniflow_outbox";

/**
 * The channel's name before the rename to Uniflow (issue #133). For one release, web signals both
 * and the worker listens on both, so a web task and a worker from different releases still reach
 * each other while a deploy rolls out (otherwise delivery would wait for the next poll). Removed
 * in the release after (#138).
 */
export const OLD_OUTBOX_CHANNEL = "slotty_outbox";

/**
 * Wake the worker. Postgres only delivers the notification if the transaction
 * commits, and collapses repeats within one transaction, so it's cheap to call.
 */
export async function signalOutbox(tx: Tx) {
  await tx.$executeRaw`SELECT pg_notify(${OUTBOX_CHANNEL}, ''), pg_notify(${OLD_OUTBOX_CHANNEL}, '')`;
}
