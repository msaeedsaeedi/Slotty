import webpush from "web-push";
import { db } from "@/server/db";
import { isPushConfigured } from "./push-config";

const MAX_ATTEMPTS = 3;
/** Pushes about something hours old are noise; drop them instead of delivering late. */
const STALE_MS = 6 * 3_600_000;

let configured = false;
function configure() {
  if (configured) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:no-reply@slotty.local",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  configured = true;
}

/**
 * Deliver pending push messages. Subscriptions the push service reports as gone
 * (404/410) are deleted, which also drops their queued messages.
 */
export async function deliverPendingPush(batchSize = 100): Promise<{ sent: number; failed: number }> {
  if (!isPushConfigured()) return { sent: 0, failed: 0 };
  configure();
  await db.pushMessage.updateMany({
    where: { status: "PENDING", createdAt: { lt: new Date(Date.now() - STALE_MS) } },
    data: { status: "FAILED", lastError: "stale" },
  });
  const batch = await db.pushMessage.findMany({
    where: { status: "PENDING" },
    include: { subscription: true },
    orderBy: { createdAt: "asc" },
    take: batchSize,
  });
  let sent = 0;
  let failed = 0;
  for (const msg of batch) {
    const claimed = await db.pushMessage.updateMany({
      where: { id: msg.id, status: "PENDING", attempts: msg.attempts },
      data: { attempts: { increment: 1 } },
    });
    if (claimed.count === 0) continue;
    const { endpoint, p256dh, auth } = msg.subscription;
    try {
      await webpush.sendNotification(
        { endpoint, keys: { p256dh, auth } },
        JSON.stringify({ title: msg.title, body: msg.body, url: msg.link ?? "/notifications", tag: msg.id }),
        { TTL: 3600 },
      );
      await db.pushMessage.update({ where: { id: msg.id }, data: { status: "SENT", sentAt: new Date(), lastError: null } });
      sent++;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await db.pushSubscription.deleteMany({ where: { id: msg.subscriptionId } });
      } else {
        const attempts = msg.attempts + 1;
        await db.pushMessage.update({
          where: { id: msg.id },
          data: { status: attempts >= MAX_ATTEMPTS ? "FAILED" : "PENDING", lastError: String(err instanceof Error ? err.message : err).slice(0, 1000) },
        });
      }
      failed++;
    }
  }
  return { sent, failed };
}
