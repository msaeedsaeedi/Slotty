import { Prisma } from "@repo/database";

/** P2002 — Unique constraint failed */
export function isUniqueViolation(error: unknown): boolean {
	if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
		return false;
	}
	const prismaError = error as Prisma.PrismaClientKnownRequestError;
	return prismaError.code === "P2002";
}

/** P2025 — Record to update/delete not found */
export function isRecordNotFound(error: unknown): boolean {
	if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
		return false;
	}
	const prismaError = error as Prisma.PrismaClientKnownRequestError;
	return prismaError.code === "P2025";
}

/** P2003 — Foreign key constraint failed */
export function isForeignKeyViolation(error: unknown): boolean {
	if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
		return false;
	}
	const prismaError = error as Prisma.PrismaClientKnownRequestError;
	return prismaError.code === "P2003";
}
