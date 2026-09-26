import { db } from "@/server/db";
import { hashPassword } from "@/server/auth/password";

if (!/\/slotty_test(\?|$)/.test(process.env.DATABASE_URL ?? "")) throw new Error("Refusing to reset a non-test database");

const tables = await db.$queryRaw<{ tablename: string }[]>`
  SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);

const passwordHash = await hashPassword("password123");
await db.user.createMany({
  data: [
    { email: "ta@e2e.test", name: "Tina TA", passwordHash, status: "ACTIVE" },
    { email: "prof@e2e.test", name: "Prof Ivan", passwordHash, status: "ACTIVE" },
    { email: "sam@e2e.test", name: "Sam Student", passwordHash, status: "ACTIVE" },
    { email: "ria@e2e.test", name: "Ria Student", passwordHash, status: "ACTIVE" },
  ],
});
await db.$disconnect();
