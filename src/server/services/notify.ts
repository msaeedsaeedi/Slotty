import { SUPERSEDE_MINUTES } from "@/domain/notifications";
import type { Tx } from "@/server/db";
import { signalOutbox } from "@/server/outbox-signal";
import { isPushConfigured } from "@/server/push-config";
import { absoluteUrl } from "@/server/app-url";

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
  /**
   * Replace, don't stack: an unread item or unsent email with the same key from
   * the last SUPERSEDE_MINUTES is removed before this one is added.
   */
  groupKey?: string;
  /** With `groupKey`: list the replaced items' titles under the new body ("Earlier: …"). */
  history?: boolean;
  /** Hold the email this long, so a quick follow-up change replaces it before it goes out. */
  emailDelayMinutes?: number;
}

export interface NotifyResult {
  /** An earlier item with the same key was replaced before anyone could have read it or its email. */
  superseded: boolean;
}


export function renderEmail(n: { title: string; body: string; link?: string }) {
  const url = n.link ? absoluteUrl(n.link) : null;
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
export async function queueEmail(tx: Tx, to: string, subject: string, content: { text: string; html?: string }) {
  const email = await tx.emailOutbox.create({ data: { to, subject, text: content.text, html: content.html } });
  await signalOutbox(tx);
  return email;
}

/**
 * Record an in-app notification for each user and queue matching emails —
 * inside the caller's transaction, so nothing is sent if the change rolls back.
 */
export async function notify(tx: Tx, userIds: string[], input: NotificationInput, now = new Date()): Promise<NotifyResult> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return { superseded: false };
  const { n, superseded } = input.groupKey ? await supersede(tx, ids, input, now) : { n: input, superseded: false };
  if (n.inApp !== false) {
    await tx.notification.createMany({
      data: ids.map((userId) => ({ userId, type: n.type, title: n.title, body: n.body, link: n.link, groupKey: n.groupKey })),
    });
    // Mirror in-app notifications to devices that opted into push.
    if (isPushConfigured()) {
      const devices = await tx.pushSubscription.findMany({ where: { userId: { in: ids }, user: { status: "ACTIVE" } }, select: { id: true } });
      if (devices.length) {
        await tx.pushMessage.createMany({
          data: devices.map((d) => ({ subscriptionId: d.id, title: n.title, body: n.body.slice(0, 500), link: n.link })),
        });
        await signalOutbox(tx);
      }
    }
  }
  if (n.email === false) return { superseded };
  const users = await tx.user.findMany({
    where: { id: { in: ids }, status: "ACTIVE", ...(n.category === "reminder" ? { emailReminders: true } : {}) },
    select: { email: true },
  });
  const content = renderEmail(n);
  if (users.length === 0) return { superseded };
  const sendAfter = new Date(now.getTime() + (n.emailDelayMinutes ?? 0) * 60_000);
  await tx.emailOutbox.createMany({
    data: users.map((u) => ({ to: u.email, subject: n.title, text: content.text, html: content.html, groupKey: n.groupKey, sendAfter })),
  });
  await signalOutbox(tx);
  return { superseded };
}

/**
 * Would a new item with this key replace an earlier one the person hasn't seen
 * (unread in-app, email not sent yet)? Lets callers word it as a first message.
 */
export async function unseenEarlier(tx: Tx, userId: string, key: string, now = new Date()): Promise<boolean> {
  const since = new Date(now.getTime() - SUPERSEDE_MINUTES * 60_000);
  const user = await tx.user.findUnique({ where: { id: userId }, select: { email: true } });
  const [unread, delivered] = await Promise.all([
    tx.notification.count({ where: { userId, groupKey: key, readAt: null, createdAt: { gte: since } } }),
    user ? tx.emailOutbox.count({ where: { to: user.email, groupKey: key, status: { not: "PENDING" }, createdAt: { gte: since } } }) : 0,
  ]);
  return unread > 0 && delivered === 0;
}

/**
 * Drop recent unread items and unsent emails with the same key, so people see
 * the current state once. `superseded` is true only when something was replaced
 * and nothing with this key has already gone out by email in the window (so the
 * person can't have seen the earlier version).
 */
async function supersede(tx: Tx, ids: string[], n: NotificationInput, now: Date) {
  const since = new Date(now.getTime() - SUPERSEDE_MINUTES * 60_000);
  const key = n.groupKey!;
  const emails = (await tx.user.findMany({ where: { id: { in: ids } }, select: { email: true } })).map((u) => u.email);
  const [items, pending, delivered] = await Promise.all([
    tx.notification.findMany({ where: { userId: { in: ids }, groupKey: key, readAt: null, createdAt: { gte: since } }, select: { id: true, title: true } }),
    tx.emailOutbox.findMany({ where: { to: { in: emails }, groupKey: key, status: "PENDING" }, select: { id: true, subject: true, text: true }, orderBy: { createdAt: "asc" } }),
    tx.emailOutbox.count({ where: { to: { in: emails }, groupKey: key, status: { not: "PENDING" }, createdAt: { gte: since } } }),
  ]);
  if (items.length) await tx.notification.deleteMany({ where: { id: { in: items.map((i) => i.id) } } });
  if (pending.length) await tx.emailOutbox.deleteMany({ where: { id: { in: pending.map((e) => e.id) } } });
  // Oldest first, keeping the history an already-replaced email carried.
  const carried = pending.flatMap((e) => /\n\nEarlier: ([^\n]+)\./.exec(e.text)?.[1].split("; ") ?? []);
  const replaced = [...new Set([...carried, ...items.map((i) => i.title), ...pending.map((e) => e.subject)])];
  const body = n.history && replaced.length ? `${n.body}\n\nEarlier: ${replaced.join("; ")}.` : n.body;
  return { n: { ...n, body }, superseded: replaced.length > 0 && delivered === 0 };
}
