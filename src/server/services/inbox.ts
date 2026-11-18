import { assignmentOf, FYI_NOTIFICATION_TYPES } from "@/domain/notifications";
import { db } from "@/server/db";
import type { Actor } from "./access";

export function listNotifications(actor: Actor, take = 50) {
  return db.notification.findMany({ where: { userId: actor.id }, orderBy: { createdAt: "desc" }, take });
}

/** The bell badge: unread items that need the person, not FYI ones (`needsAction`). */
export function unreadCount(actor: Actor) {
  return db.notification.count({ where: { userId: actor.id, readAt: null, type: { notIn: FYI_NOTIFICATION_TYPES } } });
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

/**
 * The notification list grouped by the assignment each item is about (newest
 * group first), with everything else under "Other". Titles come from the
 * actor's own items only, so nothing about other assignments is looked up.
 */
export async function groupByAssignment<T extends { link: string | null; createdAt: Date }>(items: T[]) {
  const ids = [...new Set(items.map((n) => assignmentOf(n.link)).filter((id): id is string => Boolean(id)))];
  const assignments = ids.length
    ? await db.assignment.findMany({ where: { id: { in: ids } }, select: { id: true, title: true, course: { select: { code: true } } } })
    : [];
  const label = new Map(assignments.map((a) => [a.id, `${a.title} · ${a.course.code}`]));
  const groups = new Map<string, { key: string; label: string; items: T[] }>();
  for (const n of items) {
    const id = assignmentOf(n.link);
    const key = id && label.has(id) ? id : "other";
    const g = groups.get(key) ?? { key, label: key === "other" ? "Other" : label.get(key)!, items: [] };
    g.items.push(n);
    groups.set(key, g);
  }
  // Items are newest first, so groups come out ordered by their latest item; "Other" goes last.
  return [...groups.values()].sort((a, b) => Number(a.key === "other") - Number(b.key === "other"));
}
