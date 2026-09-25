import type { Prisma } from "@/generated/prisma/client";
import type { Tx } from "@/server/db";
import type { Actor } from "./access";

export function audit(
  tx: Tx,
  actor: Actor | null,
  entry: { action: string; entityType: string; entityId: string; before?: unknown; after?: unknown },
) {
  return tx.auditLog.create({
    data: {
      actorId: actor?.id ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      before: (entry.before ?? undefined) as Prisma.InputJsonValue | undefined,
      after: (entry.after ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}
