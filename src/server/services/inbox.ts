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

/** Mark one of the actor's notifications read and return where it points. */
export async function openNotification(actor: Actor, id: string) {
  const n = await db.notification.findFirst({ where: { id, userId: actor.id } });
  if (!n) return null;
  if (!n.readAt) await db.notification.update({ where: { id }, data: { readAt: new Date() } });
  return n.link;
}
