import { z } from "zod";
import { DomainError } from "@/domain/result";
import { db, type Tx } from "@/server/db";
import { hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from "@/server/auth/password";
import { absoluteUrl } from "@/server/app-url";
import { generateToken, hashToken } from "@/server/auth/tokens";
import type { Actor } from "./access";
import { queueEmail, renderEmail } from "./notify";

const INVITE_DAYS = 14;
const RESET_HOURS = 2;

export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
  .max(200);


let dummyHash: Promise<string> | undefined;

/** Returns the user when the credentials match an active account. */
export async function authenticate(email: string, password: string) {
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  // Always run a verify to keep timing similar for unknown emails.
  const ok = await verifyPassword(user?.passwordHash ?? (await (dummyHash ??= hashPassword("not-a-real-password"))), password);
  if (!user || !ok) throw new DomainError("Incorrect email or password.");
  if (user.status === "DISABLED") throw new DomainError("This account has been disabled.");
  if (user.status !== "ACTIVE") throw new DomainError("Please accept your invitation email first.");
  return user;
}

/** Create an invite token and queue the invite email. Invalidates earlier invites. */
export async function issueInvite(tx: Tx, user: { id: string; email: string; name: string }, context: string) {
  await tx.authToken.updateMany({
    where: { userId: user.id, type: "INVITE", usedAt: null },
    data: { usedAt: new Date() },
  });
  const token = generateToken();
  await tx.authToken.create({
    data: {
      userId: user.id,
      type: "INVITE",
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000),
    },
  });
  const link = absoluteUrl(`/invite/${token}`);
  const content = renderEmail({
    title: "You're invited to Slotty",
    body: `Hi ${user.name},\n\n${context}\n\nSet your password to get started (link valid for ${INVITE_DAYS} days):\n${link}`,
  });
  await queueEmail(tx, user.email, "You're invited to Slotty", content);
  return token;
}

async function consumeToken(tx: Tx, token: string, type: "INVITE" | "PASSWORD_RESET") {
  const record = await tx.authToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!record || record.type !== type || record.usedAt || record.expiresAt < new Date()) {
    throw new DomainError("This link is invalid or has expired.");
  }
  if (record.user.status === "DISABLED") throw new DomainError("This account has been disabled.");
  await tx.authToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
  return record.user;
}

export async function peekInvite(token: string) {
  const record = await db.authToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!record || record.type !== "INVITE" || record.usedAt || record.expiresAt < new Date()) return null;
  return { email: record.user.email, name: record.user.name };
}

export async function acceptInvite(token: string, input: { name: string; password: string }) {
  const password = passwordSchema.parse(input.password);
  const name = z.string().trim().min(1, "Enter your name.").max(120).parse(input.name);
  const passwordHash = await hashPassword(password);
  return db.$transaction(async (tx) => {
    const user = await consumeToken(tx, token, "INVITE");
    return tx.user.update({ where: { id: user.id }, data: { name, passwordHash, status: "ACTIVE" } });
  });
}

/** Always succeeds from the caller's view, so it can't be used to probe which emails exist. */
export async function requestPasswordReset(email: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!user || user.status === "DISABLED") return;
    if (user.status === "INVITED") {
      await issueInvite(tx, user, "You asked to reset your password, but haven't activated your account yet.");
      return;
    }
    const token = generateToken();
    await tx.authToken.create({
      data: {
        userId: user.id,
        type: "PASSWORD_RESET",
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + RESET_HOURS * 3_600_000),
      },
    });
    const link = absoluteUrl(`/reset-password/${token}`);
    await queueEmail(
      tx,
      user.email,
      "Reset your Slotty password",
      renderEmail({
        title: "Reset your password",
        body: `Hi ${user.name},\n\nUse this link within ${RESET_HOURS} hours to choose a new password:\n${link}\n\nIf you didn't ask for this, ignore this email.`,
      }),
    );
  });
}

export async function resetPassword(token: string, newPassword: string) {
  const password = passwordSchema.parse(newPassword);
  const passwordHash = await hashPassword(password);
  return db.$transaction(async (tx) => {
    const user = await consumeToken(tx, token, "PASSWORD_RESET");
    await tx.session.deleteMany({ where: { userId: user.id } });
    return tx.user.update({ where: { id: user.id }, data: { passwordHash } });
  });
}

// ─── Account page ─────────────────────────────────────────────────────────────

export async function getAccount(actor: Actor) {
  return db.user.findUniqueOrThrow({
    where: { id: actor.id },
    select: { name: true, email: true, emailReminders: true, emailAgenda: true, calendarToken: true, _count: { select: { sessions: true } } },
  });
}

export async function updateProfile(actor: Actor, input: { name: string }) {
  const name = z.string().trim().min(1, "Enter your name.").max(120).parse(input.name);
  await db.user.update({ where: { id: actor.id }, data: { name } });
}

/**
 * Change password after checking the current one. Other devices are signed out;
 * the session identified by `keepSessionHash` (this browser) stays.
 */
export async function changePassword(actor: Actor, input: { current: string; next: string }, keepSessionHash: string | null) {
  const next = passwordSchema.parse(input.next);
  const user = await db.user.findUniqueOrThrow({ where: { id: actor.id } });
  if (!user.passwordHash || !(await verifyPassword(user.passwordHash, input.current))) {
    throw new DomainError("Your current password is incorrect.");
  }
  const passwordHash = await hashPassword(next);
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: actor.id }, data: { passwordHash } });
    await tx.session.deleteMany({ where: { userId: actor.id, ...(keepSessionHash ? { tokenHash: { not: keepSessionHash } } : {}) } });
  });
}

export async function setEmailPreferences(actor: Actor, prefs: { emailReminders: boolean; emailAgenda: boolean }) {
  await db.user.update({ where: { id: actor.id }, data: { emailReminders: prefs.emailReminders, emailAgenda: prefs.emailAgenda } });
}

/** Sign out everywhere except this browser. Returns how many sessions ended. */
export async function signOutOtherSessions(actor: Actor, keepSessionHash: string | null) {
  const r = await db.session.deleteMany({
    where: { userId: actor.id, ...(keepSessionHash ? { tokenHash: { not: keepSessionHash } } : {}) },
  });
  return r.count;
}
