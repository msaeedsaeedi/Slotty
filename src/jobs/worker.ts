/**
 * Background worker: delivers queued emails and schedules demo reminders.
 * Run alongside the web app with `bun run worker`.
 */
import "dotenv/config";
import { deliverPendingEmails } from "@/server/mailer";
import { announceOpenedBookings } from "@/server/services/automations";
import { queueDueReminders } from "@/server/services/reminders";

const INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS ?? 15_000);
let running = true;

async function tick() {
  try {
    const opened = await announceOpenedBookings();
    const reminders = await queueDueReminders();
    const { sent, failed } = await deliverPendingEmails();
    if (opened || reminders || sent || failed) {
      console.log(`[worker] ${new Date().toISOString()} opened=${opened} reminders=${reminders} sent=${sent} failed=${failed}`);
    }
  } catch (err) {
    console.error("[worker] tick failed", err);
  }
}

async function main() {
  console.log(`[worker] started (every ${INTERVAL_MS / 1000}s, SMTP ${process.env.SMTP_HOST ? "on" : "off — printing emails"})`);
  while (running) {
    await tick();
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    running = false;
    process.exit(0);
  });
}

void main();
