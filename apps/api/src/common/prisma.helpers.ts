import { Prisma } from "@prisma/client";

/** P2002 — Unique constraint failed */
export function isUniqueViolation(error: unknown): boolean {
	return (
		error instanceof Prisma.PrismaClientKnownRequestError &&
		error.code === "P2002"
	);
}

/** P2025 — Record to update/delete not found */
export function isRecordNotFound(error: unknown): boolean {
	return (
		error instanceof Prisma.PrismaClientKnownRequestError &&
		error.code === "P2025"
	);
}

/** P2003 — Foreign key constraint failed */
export function isForeignKeyViolation(error: unknown): boolean {
	return (
		error instanceof Prisma.PrismaClientKnownRequestError &&
		error.code === "P2003"
	);
}
