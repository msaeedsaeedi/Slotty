import { BasePrismaClient } from "./client";

const globalForPrisma = globalThis as unknown as {
	prisma?: BasePrismaClient;
};

export const prisma = globalForPrisma.prisma ?? new BasePrismaClient();

if (process.env.NODE_ENV !== "production") {
	globalForPrisma.prisma = prisma;
}

export { BasePrismaClient } from "./client";
export * from "./generated/prisma";
