import webpush from "web-push";
import { db } from "@/server/db";
import { mapLimit } from "@/lib/concurrency";
import { isPushConfigured } from "./push-config";

const MAX_ATTEMPTS = 3;
/** Parallel requests to the browsers' push services. */
const CONCURRENCY = 10;
/** Pushes about something hours old are noise; drop them instead of delivering late. */
const STALE_MS = 6 * 3_600_000;

let configured = false;
function configure() {
  if (configured) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:no-reply@slotty.local",
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  configured = true;
}

/**
 * Deliver pending push messages. Subscriptions the push service reports as gone
 * (404/410) are deleted, which also drops their queued messages.
 * `fetched === batchSize` means there may be more waiting.
 */
export async function deliverPendingPush(batchSize = 100): Promise<{ sent: number; failed: number; fetched: number }> {
  if (!isPushConfigured()) return { sent: 0, failed: 0, fetched: 0 };
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
  const outcomes = await mapLimit(batch, CONCURRENCY, async (msg) => {
    const claimed = await db.pushMessage.updateMany({
      where: { id: msg.id, status: "PENDING", attempts: msg.attempts },
      data: { attempts: { increment: 1 } },
    });
    if (claimed.count === 0) return "skipped" as const;
    const { endpoint, p256dh, auth } = msg.subscription;
    try {
      await webpush.sendNotification(
        { endpoint, keys: { p256dh, auth } },
        JSON.stringify({ title: msg.title, body: msg.body, url: msg.link ?? "/notifications", tag: msg.id }),
        { TTL: 3600 },
      );
      await db.pushMessage.updateMany({ where: { id: msg.id }, data: { status: "SENT", sentAt: new Date(), lastError: null } });
      return "sent" as const;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await db.pushSubscription.deleteMany({ where: { id: msg.subscriptionId } });
      } else {
        const attempts = msg.attempts + 1;
        // updateMany: a parallel 404/410 for the same device may already have deleted this row.
        await db.pushMessage.updateMany({
          where: { id: msg.id },
          data: { status: attempts >= MAX_ATTEMPTS ? "FAILED" : "PENDING", lastError: String(err instanceof Error ? err.message : err).slice(0, 1000) },
        });
      }
      return "failed" as const;
    }
  });
  return {
    sent: outcomes.filter((o) => o === "sent").length,
    failed: outcomes.filter((o) => o === "failed").length,
    fetched: batch.length,
  };
}
