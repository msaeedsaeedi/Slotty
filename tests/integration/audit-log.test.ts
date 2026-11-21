import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { audit } from "@/server/services/audit";
import { makeUser, resetDb } from "./helpers";

beforeEach(resetDb);

async function entry() {
  const actor = await makeUser("Ada", { isAdmin: true });
  const row = await db.$transaction((tx) => audit(tx, actor, { action: "user.disable", entityType: "User", entityId: "u1", after: { status: "DISABLED" } }));
  return { actor, row };
}

describe("audit log is append-only", () => {
  it("accepts new entries", async () => {
    const { row } = await entry();
    await expect(db.auditLog.findUniqueOrThrow({ where: { id: row.id } })).resolves.toMatchObject({ action: "user.disable" });
  });

  it("refuses to change an entry", async () => {
    const { row } = await entry();
    await expect(db.auditLog.update({ where: { id: row.id }, data: { action: "user.enable" } })).rejects.toThrow(/append-only/);
    await expect(db.$executeRaw`UPDATE "AuditLog" SET "after" = NULL`).rejects.toThrow(/append-only/);
    await expect(db.auditLog.findUniqueOrThrow({ where: { id: row.id } })).resolves.toMatchObject({ action: "user.disable" });
  });

  it("refuses to delete an entry", async () => {
    const { row } = await entry();
    await expect(db.auditLog.delete({ where: { id: row.id } })).rejects.toThrow(/append-only/);
    await expect(db.$executeRaw`DELETE FROM "AuditLog"`).rejects.toThrow(/append-only/);
    expect(await db.auditLog.count()).toBe(1);
  });

  it("keeps the history when someone tries to delete the actor", async () => {
    const { actor } = await entry();
    // Deleting the user would null the entry's actor (onDelete: SetNull), which is a change.
    await expect(db.user.delete({ where: { id: actor.id } })).rejects.toThrow(/append-only/);
    expect(await db.auditLog.count({ where: { actorId: actor.id } })).toBe(1);
  });
});
