type AttemptResult<T, E = Error> = readonly [E, null] | readonly [null, T];

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
