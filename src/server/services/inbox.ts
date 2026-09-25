import { db } from "@/server/db";
import type { Actor } from "./access";

export function listNotifications(actor: Actor, take = 50) {
  return db.notification.findMany({ where: { userId: actor.id }, orderBy: { createdAt: "desc" }, take });
}

export function unreadCount(actor: Actor) {
  return db.notification.count({ where: { userId: actor.id, readAt: null } });
}

export async function markRead(actor: Actor, ids?: string[]) {
  await db.notification.updateMany({
    where: { userId: actor.id, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
    data: { readAt: new Date() },
  });
}
