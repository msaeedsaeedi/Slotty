import { createHash } from "node:crypto";
import type { AuthAttemptKind } from "@/generated/prisma/client";
import { AUTH_LIMITS } from "@/domain/auth-limits";
import type { Tx } from "@/server/db";

/** Keys are hashed: the table holds no emails or addresses. */
export const accountKey = (email: string) => createHash("sha256").update(`account:${email.trim().toLowerCase()}`).digest("hex");
export const networkKey = (ip: string | null) => (ip ? createHash("sha256").update(`network:${ip}`).digest("hex") : null);

/** Recent attempts of one kind for a key, and when the latest was. */
export async function recentAttempts(tx: Tx, kind: AuthAttemptKind, keyHash: string, windowMs: number, now: Date) {
  const r = await tx.authAttempt.aggregate({
    where: { kind, keyHash, createdAt: { gt: new Date(now.getTime() - windowMs) } },
    _count: true,
    _max: { createdAt: true },
  });
  return { count: r._count, last: r._max.createdAt };
}

export async function recordAttempt(tx: Tx, kind: AuthAttemptKind, keys: (string | null)[], now: Date) {
  const data = keys.filter((k): k is string => Boolean(k)).map((keyHash) => ({ kind, keyHash, createdAt: now }));
  if (data.length) await tx.authAttempt.createMany({ data });
}

/** Worker: forget attempts older than a day. */
export async function pruneAuthAttempts(tx: Tx, now = new Date()) {
  const { count } = await tx.authAttempt.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - AUTH_LIMITS.keepMs) } } });
  return count;
}
