/**
 * Create the first platform admin on a fresh production database (the demo seed
 * is for development only). Idempotent: an existing account is promoted to admin
 * and its password is left alone.
 *
 *   ADMIN_EMAIL=you@uni.edu ADMIN_PASSWORD='…' ADMIN_NAME='Your Name' bun run admin:create
 */
import { db } from "@/server/db";
import { hashPassword, MIN_PASSWORD_LENGTH } from "@/server/auth/password";

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "";
  const name = process.env.ADMIN_NAME?.trim() || "Slotty Admin";
  if (!email) throw new Error("Set ADMIN_EMAIL.");

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    await db.user.update({ where: { id: existing.id }, data: { isAdmin: true } });
    console.log(`${email} already exists — made them an admin (password unchanged).`);
    return;
  }
  if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`Set ADMIN_PASSWORD (at least ${MIN_PASSWORD_LENGTH} characters).`);
  await db.user.create({ data: { email, name, isAdmin: true, status: "ACTIVE", passwordHash: await hashPassword(password) } });
  console.log(`Created admin ${email}.`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
