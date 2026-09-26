import type { Tx } from "@/server/db";

/** Postgres channel the worker LISTENs on to deliver queued emails and pushes right away. */
export const OUTBOX_CHANNEL = "slotty_outbox";

/**
 * Wake the worker. Postgres only delivers the notification if the transaction
 * commits, and collapses repeats within one transaction, so it's cheap to call.
 */
export async function signalOutbox(tx: Tx) {
  await tx.$executeRaw`SELECT pg_notify(${OUTBOX_CHANNEL}, '')`;
}
