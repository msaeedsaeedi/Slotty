/**
 * Grant or revoke platform (product-team) access: usage insights and feedback at
 * /platform. Deliberately not in the admin console. A platform account is a
 * dedicated account: never an admin and never in a course (`canGrantPlatform`).
 *
 *   PLATFORM_EMAIL=you@uni.edu PLATFORM_PASSWORD='…' PLATFORM_NAME='Your Name' bun run platform:grant
 *   PLATFORM_EMAIL=you@uni.edu bun run platform:revoke
 *
 * Grant creates the account if it doesn't exist (active, with that password);
 * for an existing account the password is left alone. Revoke signs it out.
 */
import { canGrantPlatform } from "@/domain/roles";
import { hashPassword, MIN_PASSWORD_LENGTH } from "@/server/auth/password";
import { db } from "@/server/db";
import { audit } from "@/server/services/audit";

async function main() {
  const command = process.argv[2];
  const email = process.env.PLATFORM_EMAIL?.trim().toLowerCase();
  if (command !== "grant" && command !== "revoke") throw new Error("Usage: platform-access.ts grant|revoke (with PLATFORM_EMAIL set).");
  if (!email) throw new Error("Set PLATFORM_EMAIL.");

  await db.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({
      where: { email },
      include: { enrollments: { select: { course: { select: { code: true } } } } },
    });

    if (command === "revoke") {
      if (!existing?.platformAccess) return console.log(`${email} has no platform access.`);
      await tx.user.update({ where: { id: existing.id }, data: { platformAccess: false } });
      await tx.session.deleteMany({ where: { userId: existing.id } });
      await audit(tx, null, { action: "platform.revoke", entityType: "User", entityId: existing.id });
      return console.log(`Revoked platform access for ${email} and signed them out.`);
    }

    if (existing) {
      const rule = canGrantPlatform({ isAdmin: existing.isAdmin, courses: existing.enrollments.map((e) => e.course.code) });
      if (!rule.ok) throw new Error(`${email} ${rule.reason}`);
      if (existing.status !== "ACTIVE") throw new Error(`${email} is ${existing.status.toLowerCase()}; activate it first.`);
      await tx.user.update({ where: { id: existing.id }, data: { platformAccess: true } });
      await audit(tx, null, { action: "platform.grant", entityType: "User", entityId: existing.id });
      return console.log(`Granted platform access to ${email} (password unchanged).`);
    }

    const password = process.env.PLATFORM_PASSWORD ?? "";
    if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`Set PLATFORM_PASSWORD (at least ${MIN_PASSWORD_LENGTH} characters).`);
    const user = await tx.user.create({
      data: {
        email,
        name: process.env.PLATFORM_NAME?.trim() || "Uniflow Platform",
        status: "ACTIVE",
        platformAccess: true,
        shareUsageData: false,
        passwordHash: await hashPassword(password),
      },
    });
    await audit(tx, null, { action: "platform.grant", entityType: "User", entityId: user.id });
    console.log(`Created platform account ${email}.`);
  });
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
