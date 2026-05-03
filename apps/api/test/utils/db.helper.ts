import { PrismaClient } from "@repo/database";

// Use test database URL
const testPrisma = new PrismaClient({
	datasources: {
		db: { url: process.env.DATABASE_URL },
	},
});

export async function clearDatabase() {
	// Order matters due to foreign keys
	const tablenames = await testPrisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname='public'
  `;

	for (const { tablename } of tablenames) {
		if (tablename !== "_prisma_migrations") {
			await testPrisma.$executeRawUnsafe(
				`TRUNCATE TABLE "${tablename}" CASCADE;`,
			);
		}
	}
}

export async function closeTestDb() {
	await testPrisma.$disconnect();
}

export { testPrisma };
