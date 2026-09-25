import { z } from "zod";
import { DomainError } from "@/domain/result";
import { db } from "@/server/db";
import { isPushConfigured } from "@/server/push-config";
import type { Actor } from "./access";

export const pushSubscriptionInput = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(500), auth: z.string().min(1).max(500) }),
});

/**
 * Remember this browser's push subscription for the signed-in session. The same
 * endpoint re-subscribing (or moving to another account) replaces the old row.
 */
export async function savePushSubscription(actor: Actor, sessionHash: string | null, input: unknown, userAgent: string | null) {
  if (!isPushConfigured()) throw new DomainError("Push notifications aren't set up on this server.");
  const sub = pushSubscriptionInput.parse(input);
  const session = sessionHash ? await db.session.findUnique({ where: { tokenHash: sessionHash } }) : null;
  if (!session || session.userId !== actor.id) throw new DomainError("Please sign in again.", "FORBIDDEN");
  const data = { userId: actor.id, sessionId: session.id, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent?.slice(0, 300) ?? null };
  await db.pushSubscription.upsert({ where: { endpoint: sub.endpoint }, create: { endpoint: sub.endpoint, ...data }, update: data });
}

export async function removePushSubscription(actor: Actor, endpoint: string) {
  await db.pushSubscription.deleteMany({ where: { endpoint, userId: actor.id } });
}

export function countPushDevices(actor: Actor) {
  return db.pushSubscription.count({ where: { userId: actor.id } });
}
