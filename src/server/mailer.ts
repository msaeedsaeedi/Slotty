import nodemailer, { type Transporter } from "nodemailer";
import { db } from "@/server/db";
import { mapLimit } from "@/lib/concurrency";
import { smtpOptions } from "@/server/smtp-options";

const MAX_ATTEMPTS = 5;
/** Parallel sends over the pooled SMTP connections. */
const CONCURRENCY = 5;

let transport: Transporter | null | undefined;

/**
 * One pooled SMTP transport for the worker's lifetime (null = local development only: the
 * email is marked sent and noted in the log without its body; deployments refuse to start
 * without SMTP, `mailConfigProblems`).
 */
function getTransport() {
  if (transport !== undefined) return transport;
  const options = smtpOptions();
  // TLS is required for every non-local server (smtpOptions), so a downgrade fails the send.
  transport = options ? nodemailer.createTransport({ ...options, pool: true, maxConnections: CONCURRENCY }) : null;
  return transport;
}

/** Close pooled SMTP connections (worker shutdown). */
export function closeMailer() {
  transport?.close();
  transport = undefined;
}

/**
 * Deliver pending outbox emails. Without SMTP (local development only), each is noted in the
 * log without its body.
 * `fetched === batchSize` means there may be more waiting.
 */
export async function deliverPendingEmails(batchSize = 50): Promise<{ sent: number; failed: number; fetched: number }> {
  const smtp = getTransport();
  const from = process.env.MAIL_FROM ?? "Slotty <no-reply@slotty.local>";
  const batch = await db.emailOutbox.findMany({
    where: { status: "PENDING", sendAfter: { lte: new Date() } },
    orderBy: { createdAt: "asc" },
    take: batchSize,
  });
  const outcomes = await mapLimit(batch, CONCURRENCY, async (email) => {
    // Claim the row so concurrent workers don't double-send.
    const claimed = await db.emailOutbox.updateMany({
      where: { id: email.id, status: "PENDING", attempts: email.attempts },
      data: { attempts: { increment: 1 } },
    });
    if (claimed.count === 0) return "skipped" as const;
    try {
      if (smtp) {
        await smtp.sendMail({ from, to: email.to, subject: email.subject, text: email.text, html: email.html ?? undefined });
      } else {
        // Never the body: it can hold invite and reset links, or marks, and logs are kept.
        console.log(`✉️  To: ${email.to} · Subject: ${email.subject} (not sent: SMTP_HOST is unset; read it at /dev/mail)`);
      }
      await db.emailOutbox.update({ where: { id: email.id }, data: { status: "SENT", sentAt: new Date(), lastError: null } });
      return "sent" as const;
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
      return "failed" as const;
    }
  });
  return {
    sent: outcomes.filter((o) => o === "sent").length,
    failed: outcomes.filter((o) => o === "failed").length,
    fetched: batch.length,
  };
}
