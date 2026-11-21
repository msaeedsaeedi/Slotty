import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { hashPassword } from "@/server/auth/password";
import { pruneAuthAttempts } from "@/server/auth/limits";
import { adminSendAccessEmail } from "@/server/services/admin";
import { authenticate, changePassword, requestPasswordReset, resetPassword } from "@/server/services/accounts";
import { makeUser, resetDb } from "./helpers";

beforeEach(resetDb);

// Relative to the real clock: reset links expire against `new Date()`, so a fixed date stops working two hours later.
const t0 = new Date();
const at = (s: number) => new Date(t0.getTime() + s * 1000);

async function withPassword(name: string, password = "correct-horse") {
  const u = await makeUser(name);
  await db.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(password) } });
  return u;
}

describe("sign-in limits", () => {
  it("backs off an account after five failures, and a success clears it", async () => {
    const u = await withPassword("Sam");
    for (let i = 0; i < 5; i++) await expect(authenticate(u.email, "wrong", "10.0.0.1", at(i))).rejects.toThrow(/Incorrect/);
    // Even the right password waits now, so guessing gains nothing.
    await expect(authenticate(u.email, "correct-horse", "10.0.0.1", at(10))).rejects.toThrow(/Too many failed sign-ins for this email/);
    await expect(authenticate(u.email, "correct-horse", "10.0.0.1", at(40))).resolves.toMatchObject({ id: u.id });
    expect(await db.authAttempt.count({ where: { kind: "SIGN_IN_FAILURE" } })).toBe(5); // the network's rows stay
    await expect(authenticate(u.email, "wrong", "10.0.0.1", at(41))).rejects.toThrow(/Incorrect/);
  });

  it("treats unknown emails exactly like real ones", async () => {
    for (let i = 0; i < 5; i++) await expect(authenticate("nobody@test.edu", "x", null, at(i))).rejects.toThrow(/Incorrect/);
    await expect(authenticate("Nobody@test.edu ", "x", null, at(6))).rejects.toThrow(/Too many failed sign-ins for this email/);
  });

  it("limits one network across accounts, but not others", async () => {
    const u = await withPassword("Sam");
    for (let i = 0; i < 50; i++) await expect(authenticate(`guess${i}@test.edu`, "x", "10.0.0.9", at(i))).rejects.toThrow(/Incorrect/);
    await expect(authenticate(u.email, "correct-horse", "10.0.0.9", at(60))).rejects.toThrow(/from your network/);
    await expect(authenticate(u.email, "correct-horse", "10.0.0.10", at(60))).resolves.toMatchObject({ id: u.id });
    // No trustworthy address: only the per-account limit applies.
    await expect(authenticate(u.email, "correct-horse", null, at(61))).resolves.toMatchObject({ id: u.id });
  });

  it("applies the account limit to changing the password too", async () => {
    const u = await withPassword("Sam");
    for (let i = 0; i < 5; i++) await expect(changePassword(u, { current: "wrong", next: "new-password-1" }, null, at(i))).rejects.toThrow(/current password/);
    await expect(changePassword(u, { current: "correct-horse", next: "new-password-1" }, null, at(10))).rejects.toThrow(/Too many/);
  });

  it("stores only hashes", async () => {
    const u = await withPassword("Sam");
    await expect(authenticate(u.email, "wrong", "10.0.0.1", t0)).rejects.toThrow();
    const rows = await db.authAttempt.findMany();
    expect(rows.every((r) => /^[0-9a-f]{64}$/.test(r.keyHash))).toBe(true);
    expect(JSON.stringify(rows)).not.toContain(u.email);
    expect(JSON.stringify(rows)).not.toContain("10.0.0.1");
  });
});

describe("password reset limits", () => {
  it("sends at most three emails an hour to one person, silently", async () => {
    const u = await withPassword("Sam");
    for (let i = 0; i < 5; i++) await requestPasswordReset(u.email, { ip: `10.0.1.${i}`, now: at(i) });
    expect(await db.emailOutbox.count({ where: { to: u.email } })).toBe(3);
    await requestPasswordReset(u.email, { ip: "10.0.1.9", now: at(3601) });
    expect(await db.emailOutbox.count({ where: { to: u.email } })).toBe(4);
  });

  it("refuses a network that asks too often, whoever it asks for", async () => {
    for (let i = 0; i < 10; i++) await requestPasswordReset(`x${i}@test.edu`, { ip: "10.0.2.1", now: at(i) });
    await expect(requestPasswordReset("y@test.edu", { ip: "10.0.2.1", now: at(11) })).rejects.toThrow(/reset requests from your network/);
    await expect(requestPasswordReset("y@test.edu", { ip: "10.0.2.2", now: at(11) })).resolves.toBeUndefined();
  });

  it("voids earlier reset links, and a reset lifts the sign-in wait", async () => {
    const u = await withPassword("Sam");
    await requestPasswordReset(u.email, { now: at(0) });
    await requestPasswordReset(u.email, { now: at(1) });
    const tokens = await db.authToken.findMany({ where: { userId: u.id, type: "PASSWORD_RESET" }, orderBy: { createdAt: "asc" } });
    expect(tokens.map((t) => t.usedAt !== null)).toEqual([true, false]);

    for (let i = 0; i < 6; i++) await expect(authenticate(u.email, "wrong", null)).rejects.toThrow();
    // Reset through the link (the raw token is only in the email): mark it as issued for this test.
    const { generateToken, hashToken } = await import("@/server/auth/tokens");
    const raw = generateToken();
    await db.authToken.update({ where: { id: tokens[1].id }, data: { tokenHash: hashToken(raw) } });
    await resetPassword(raw, "brand-new-password");
    await expect(authenticate(u.email, "brand-new-password", null)).resolves.toMatchObject({ id: u.id });
  });

  it("doesn't cap the admin console's reset email", async () => {
    const admin = await makeUser("Ada", { isAdmin: true });
    const u = await withPassword("Sam");
    for (let i = 0; i < 4; i++) await adminSendAccessEmail(admin, u.id);
    expect(await db.emailOutbox.count({ where: { to: u.email } })).toBe(4);
  });
});

describe("pruning", () => {
  it("deletes attempts older than a day", async () => {
    await expect(authenticate("a@test.edu", "x", "10.0.0.1", t0)).rejects.toThrow();
    expect(await pruneAuthAttempts(db, at(23 * 3600))).toBe(0);
    expect(await pruneAuthAttempts(db, at(25 * 3600))).toBe(2);
  });
});
