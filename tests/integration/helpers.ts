import { db } from "@/server/db";
import type { Actor } from "@/server/services/access";

/** Wipe every table (test DB only). */
export async function resetDb() {
  if (!process.env.DATABASE_URL?.includes("51218")) throw new Error("Refusing to reset a non-test database");
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
}

let n = 0;
export async function makeUser(name: string, opts: { isAdmin?: boolean } = {}): Promise<Actor> {
  n++;
  const user = await db.user.create({
    data: { email: `${name.toLowerCase().replace(/\s+/g, ".")}.${n}@test.edu`, name, status: "ACTIVE", isAdmin: opts.isAdmin ?? false },
  });
  return { id: user.id, email: user.email, name: user.name, isAdmin: user.isAdmin };
}

export const inHours = (h: number, from = new Date()) => new Date(from.getTime() + h * 3_600_000);
