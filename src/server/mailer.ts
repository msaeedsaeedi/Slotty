import nodemailer from "nodemailer";
import { db } from "@/server/db";

const MAX_ATTEMPTS = 5;

function createTransport() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
}

/** Deliver pending outbox emails. Without SMTP configured, emails are printed to the console. */
export async function deliverPendingEmails(batchSize = 50): Promise<{ sent: number; failed: number }> {
  const transport = createTransport();
  const from = process.env.MAIL_FROM ?? "Slotty <no-reply@slotty.local>";
  const batch = await db.emailOutbox.findMany({
    where: { status: "PENDING", sendAfter: { lte: new Date() } },
    orderBy: { createdAt: "asc" },
    take: batchSize,
  });
  let sent = 0;
  let failed = 0;
  for (const email of batch) {
    // Claim the row so concurrent workers don't double-send.
    const claimed = await db.emailOutbox.updateMany({
      where: { id: email.id, status: "PENDING", attempts: email.attempts },
      data: { attempts: { increment: 1 } },
    });
    if (claimed.count === 0) continue;
    try {
      if (transport) {
        await transport.sendMail({ from, to: email.to, subject: email.subject, text: email.text, html: email.html ?? undefined });
      } else {
        console.log(`\n✉️  To: ${email.to}\n   Subject: ${email.subject}\n   ${email.text.replace(/\n/g, "\n   ")}\n`);
      }
      await db.emailOutbox.update({ where: { id: email.id }, data: { status: "SENT", sentAt: new Date(), lastError: null } });
      sent++;
    } catch (err) {
      const attempts = email.attempts + 1;
      await db.emailOutbox.update({
        where: { id: email.id },
        data: {
          status: attempts >= MAX_ATTEMPTS ? "FAILED" : "PENDING",
          lastError: String(err instanceof Error ? err.message : err).slice(0, 1000),
          // Exponential backoff: 1, 2, 4, 8 minutes.
          sendAfter: new Date(Date.now() + 2 ** (attempts - 1) * 60_000),
        },
      });
      failed++;
    }
  }
  return { sent, failed };
}
