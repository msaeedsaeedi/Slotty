import type { Tx } from "@/server/db";

export interface NotificationInput {
  type: string;
  title: string;
  body: string;
  /** App-relative link, e.g. /courses/abc/assignments/xyz */
  link?: string;
  /** Also send an email (default true). */
  email?: boolean;
  /** Also show it in the in-app inbox (default true). */
  inApp?: boolean;
  /** Emails in an opt-out category are skipped for users who turned them off. */
  category?: "reminder";
}

const appUrl = () => process.env.APP_URL ?? "http://localhost:3000";

export function renderEmail(n: { title: string; body: string; link?: string }) {
  const url = n.link ? new URL(n.link, appUrl()).toString() : null;
  const text = [n.body, url ? `\nOpen in Slotty: ${url}` : "", "\n— Slotty"].join("\n");
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const html = `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;padding:24px;color:#111">
<h2 style="margin:0 0 12px;font-size:18px">${esc(n.title)}</h2>
<p style="white-space:pre-line;line-height:1.5">${esc(n.body)}</p>
${url ? `<p><a href="${esc(url)}" style="display:inline-block;background:#111;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Open in Slotty</a></p>` : ""}
<p style="color:#888;font-size:12px;margin-top:24px">Slotty — demo scheduling &amp; evaluation</p></div>`;
  return { text, html };
}

/** Queue a raw email in the outbox (delivered by the worker). */
export function queueEmail(tx: Tx, to: string, subject: string, content: { text: string; html?: string }) {
  return tx.emailOutbox.create({ data: { to, subject, text: content.text, html: content.html } });
}

/**
 * Record an in-app notification for each user and queue matching emails —
 * inside the caller's transaction, so nothing is sent if the change rolls back.
 */
export async function notify(tx: Tx, userIds: string[], n: NotificationInput): Promise<void> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return;
  if (n.inApp !== false) {
    await tx.notification.createMany({
      data: ids.map((userId) => ({ userId, type: n.type, title: n.title, body: n.body, link: n.link })),
    });
  }
  if (n.email === false) return;
  const users = await tx.user.findMany({
    where: { id: { in: ids }, status: { not: "DISABLED" }, ...(n.category === "reminder" ? { emailReminders: true } : {}) },
    select: { email: true },
  });
  const content = renderEmail(n);
  await tx.emailOutbox.createMany({
    data: users.map((u) => ({ to: u.email, subject: n.title, text: content.text, html: content.html })),
  });
}
