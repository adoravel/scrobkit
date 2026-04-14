import { type Config } from "~/lib/config.ts";
import { countScrobblesInRange, scrobble, ScrobblePayload, ScrobbleResult } from "~/api/lastfm.ts";
import { CsvDocument, DocumentTrack, markSkipped } from "~/lib/csv.ts";
import { AppError, describe } from "~/lib/errors.ts";
import { sleep, withRetryR } from "~/utils/retry.ts";

const DAILY_SCROBBLE_LIMIT: number = 2880;

export interface PipelineOptions {
	config: Omit<Required<Config>, "password">;
	sessionKey: string;
	dryRun?: boolean;
	delayMs?: number;
}

export interface PipelineSummary {
	total: number;
	accepted: number;
	ignored: number;
	failed: number;
	skipped: number;
}

export interface PendingEntry {
	track: DocumentTrack;
	index: number;
	payload: ScrobblePayload;
}

export interface LimitCheckResult {
	scrobblesToday: number;
	remaining: number;
	importCount: number;
	wouldExceed: boolean;
	excess: number;

	/** true when the scrobble count could not be fetched (e.g. private account) */
	countUnavailable: boolean;
}

export async function checkDailyLimit(
	apiKey: string,
	username: string,
	importCount: number,
): Promise<LimitCheckResult> {
	const begin = Math.floor(
		Date.UTC(
			new Date().getUTCFullYear(),
			new Date().getUTCMonth(),
			new Date().getUTCDate(),
		) / 1000,
	);
	const now = Math.floor(Date.now() / 1e3);

	const result = await countScrobblesInRange(apiKey, username, begin, now);
	if (!result.ok) {
		return {
			scrobblesToday: 0,
			remaining: DAILY_SCROBBLE_LIMIT,
			importCount,
			wouldExceed: false,
			excess: 0,
			countUnavailable: true,
		};
	}

	const scrobblesToday = result.value;
	const remaining = Math.max(
		0,
		DAILY_SCROBBLE_LIMIT - scrobblesToday,
	);
	const wouldExceed = importCount > remaining;
	const excess = wouldExceed ? importCount - remaining : 0;

	return { scrobblesToday, remaining, importCount, wouldExceed, excess, countUnavailable: false };
}

/**
 * determines if a Last.fm error is worth retrying.
 *
 * transient: rate limit (29), service offline (11), operation failed (8)
 * fatal: bad auth (4, 9, 10), invalid params (6), suspended key (26)
 */
export function isRetryable(error: unknown): boolean {
	if (typeof error === "object" && error !== null) {
		const e = error as AppError;
		if (e.kind === "network") return true;
		if (e.kind === "lastfm") {
			return [8, 11, 16, 29].includes(e.tag);
		}
	}
	return false;
}

export async function runPipeline(
	pending: PendingEntry[],
	file: CsvDocument,
	opts: PipelineOptions,
	onProgress: (
		current: number,
		total: number,
		track: DocumentTrack,
		result: "ok" | "ignored" | "failed",
		detail?: string,
	) => void,
): Promise<PipelineSummary> {
	const summary: PipelineSummary = {
		total: pending.length,
		accepted: 0,
		ignored: 0,
		failed: 0,
		skipped: 0,
	};

	const delay = opts.delayMs ?? 100;
	let document = file;

	for (const [i, entry] of pending.entries()) {
		const { track, index, payload } = entry;

		if (opts.dryRun) {
			summary.accepted++, onProgress(i + 1, pending.length, track, "ok");
			continue;
		}

		try {
			const result: ScrobbleResult = await withRetryR(
				() => scrobble(opts.config.apiKey, opts.config.secret, opts.sessionKey, payload),
				{
					maxAttempts: 4,
					baseDelayMs: 500,
					retryIf: isRetryable,
					onRetry: (attempt, delayMs) => {
						console.error(`  ↺ Retry ${attempt} for "${track.title}" in ${delayMs}ms...`);
					},
				},
			);

			if (result.ignored) {
				summary.ignored += result.ignored;
				onProgress(i + 1, pending.length, track, "ignored");
			} else {
				summary.accepted += result.accepted;
				onProgress(i + 1, pending.length, track, "ok");
			}

			const marked = markSkipped(document, index);
			if (marked.ok) document = marked.value;
		} catch (e) {
			summary.failed++;
			const msg = describe(e as AppError);
			onProgress(i + 1, pending.length, track, "failed", msg);
		}

		if (i < pending.length - 1) await sleep(delay);
	}

	return summary;
}

/**
 * generate evenly-spaced timestamps for tracks that have no date.
 * starts 13.9 days before now and steps 30s per track
 */
export function generateTimestamps(count: number): number[] {
	const begin = Math.floor(Date.now() / 1_000) - 1_200_960;
	return Array.from({ length: count }, (_, i) => begin + (i + 1) * 30);
}

export function trackToPipelineEntry(
	track: DocumentTrack,
	index: number,
	timestamp: number,
): PendingEntry {
	return {
		track,
		index,
		payload: {
			artist: track.artist,
			album: track.album || undefined,
			title: track.title,
			timestamp,
		},
	};
}
