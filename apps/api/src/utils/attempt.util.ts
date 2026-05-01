type AttemptResult<T, E = Error> = readonly [E, null] | readonly [null, T];

/**
 * Wraps a Promise so it never throws. Returns a tuple of [error, result].
 * Exactly one of the two will be non-null at any time.
 *
 * @example
 * const [err, user] = await attempt(prisma.user.findUnique({ where: { id } }));
 * if (err) throw new InternalServerErrorException('DB failure');
 * if (!user) throw new NotFoundException('User not found');
 */
export async function attempt<T, E = Error>(
	promise: Promise<T>,
): Promise<AttemptResult<T, E>> {
	try {
		const data = await promise;
		return [null, data] as const;
	} catch (error) {
		return [error as E, null] as const;
	}
}
