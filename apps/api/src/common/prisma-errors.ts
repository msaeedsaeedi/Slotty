import { Prisma } from "@prisma/client";

export const isUniqueViolation = (error: unknown): boolean => {
	if (
		error instanceof Prisma.PrismaClientKnownRequestError &&
		error.code === "P2002"
	) {
		return true;
	}
	return false;
};
