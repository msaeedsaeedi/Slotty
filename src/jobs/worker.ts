/**
 * Background worker: delivers queued emails and schedules demo reminders.
 * Run alongside the web app with `bun run worker`.
 */
import "dotenv/config";
import { deliverPendingEmails } from "@/server/mailer";
import { announceOpenedBookings, closeEndedAssignments, nudgeUnbookedStudents, sendDailyAgendas } from "@/server/services/automations";
import { queueDueReminders } from "@/server/services/reminders";

const INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS ?? 15_000);
let running = true;

async function tick() {
  try {
    const opened = await announceOpenedBookings();
    const nudged = await nudgeUnbookedStudents();
    const closed = await closeEndedAssignments();
    const agendas = await sendDailyAgendas();
    const reminders = await queueDueReminders();
    const { sent, failed } = await deliverPendingEmails();
    const counts = { opened, nudged, closed, agendas, reminders, sent, failed };
    if (Object.values(counts).some(Boolean)) {
      console.log(`[worker] ${new Date().toISOString()} ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(" ")}`);
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
