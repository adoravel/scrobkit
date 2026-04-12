export interface RetryOptions {
	maxAttempts?: number;
	baseDelayMs?: number;
	maxDelayMs?: number;
	retryIf?: (error: unknown, attempt: number) => boolean;
	onRetry?: (attempt: number, delayMs: number, error: unknown) => void;
}

const defaults: Required<Omit<RetryOptions, "onRetry">> = {
	maxAttempts: 4,
	baseDelayMs: 500,
	maxDelayMs: 15_000,
	retryIf: () => true,
};

/** delay ∈ {0, ..., ⌊min(cap, base * 2^attempt)⌋ − 1}, uniformly distributed */
function jitteredDelay(attempt: number, base: number, cap: number): number {
	const ceiling = Math.min(cap, base * (2 ** attempt));
	return Math.floor(Math.random() * ceiling);
}

export async function withRetry<T>(
	fn: () => Promise<T>,
	opts: RetryOptions = {},
): Promise<T> {
	const {
		maxAttempts = defaults.maxAttempts,
		baseDelayMs = defaults.baseDelayMs,
		maxDelayMs = defaults.maxDelayMs,
		retryIf = defaults.retryIf,
		onRetry,
	} = opts;

	let lastError: unknown;

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error;

			if (attempt === maxAttempts || !retryIf(error, attempt)) {
				throw error;
			}

			const delayMs = jitteredDelay(attempt, baseDelayMs, maxDelayMs);
			onRetry?.(attempt, delayMs, error);

			await sleep(delayMs);
		}
	}

	// unreachable 🥱
	throw lastError;
}

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
