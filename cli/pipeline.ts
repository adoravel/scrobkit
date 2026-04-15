import { type Config } from "~/lib/config.ts";
import { countScrobblesInRange, scrobble, ScrobblePayload, ScrobbleResult } from "~/api/lastfm.ts";
import { AppError, describe } from "~/lib/errors.ts";
import { sleep, withRetryR } from "~/utils/retry.ts";
import { Result } from "~/lib/result.ts";
import { symbols } from "~/cli/formatter.ts";
import { dim, italic, yellow } from "@std/fmt/colors";

export const DAILY_SCROBBLE_LIMIT: number = 2880;
export const TIMESTAMP_LIMIT = 1209600; // 14 days

export type PipelineTrackMeta = ScrobblePayload;

export interface PipelineOptions<TContext = void> {
	readonly config: Omit<Required<Config>, "password">;
	readonly dryRun?: boolean;
	readonly delayMs?: number;

	/**
	 * optional callback invoked after a track is successfully scrobbled.
	 * use this to commit state changes (e.g. marking a document line, appending a log).
	 */
	readonly commitSuccess?: (context: TContext) => Promise<Result<unknown, AppError>>;
}

export interface PipelineSummary {
	readonly total: number;
	readonly accepted: number;
	readonly ignored: number;
	readonly failed: number;
}

/**
 * representation of a track waiting to be scrobbled.
 *
 * @template TContext format-specific state needed to commit the scrobble
 */
export interface PendingEntry<TContext = void> {
	readonly meta: PipelineTrackMeta;
	readonly context: TContext;
}

export interface LimitCheckResult {
	readonly scrobblesToday: number;
	readonly remaining: number;
	readonly importCount: number;
	readonly wouldExceed: boolean;
	readonly excess: number;

	/** true when the scrobble count could not be fetched (e.g. private account) */
	readonly countUnavailable: boolean;
}

export type PipelineProgressStatus = "ok" | "ignored" | "failed";

function getUtcMidnightTimestamp(): number {
	const now = Date.now();
	const msSinceMidnight = now % 864e5; // 24 * 60 * 60 * 1000
	return Math.floor((now - msSinceMidnight) / 1000);
}

export async function checkDailyLimit(
	apiKey: string,
	username: string,
	importCount: number,
): Promise<LimitCheckResult> {
	const begin = getUtcMidnightTimestamp();
	const now = Math.floor(Date.now() / 1000);

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
	const remaining = Math.max(0, DAILY_SCROBBLE_LIMIT - scrobblesToday);
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

export function reportPipelineProgress(
	summary: PipelineSummary,
	dryRun: boolean,
	current: number,
	total: number,
	meta: PipelineTrackMeta,
	status: PipelineProgressStatus,
	detail?: string,
) {
	const prefix = dryRun ? `  \u{1F6E0}  ${italic("dry run")}  ` : "  ";

	const track = yellow(`"${meta.artist} - ${meta.title}"`);
	const progress = prefix + dim(`[${current}/${total}]`);

	const timestamp = new Date(meta.timestamp * 1000).toLocaleString();

	switch (status) {
		case "ok":
			console.log(`${progress} ${symbols.success} ${track} ${dim("@ " + timestamp)}`);
			break;
		case "ignored":
			console.warn(`${progress} ${symbols.forbid} Ignored by Last.fm: ${track} ${dim("@ " + timestamp)}`);
			break;
		case "failed":
			console.error(
				`${progress} ${symbols.error} Failed: ${track}\n    → ${dim(detail ?? "(empty string)")}`,
			);
			break;
	}

	if (current !== total) return;

	if (dryRun) {
		console.log("\nNo changes were made to the file.");
	} else if (summary.failed === 0) {
		console.log(`\n✓ All scrobbles were successfully submitted.`);
	} else {
		console.warn(`\n⚠ Finished with errors.`);
	}
}

export async function runPipeline<TContext>(
	pending: readonly PendingEntry<TContext>[],
	opts: PipelineOptions<TContext>,
	$onProgress: (
		this: PipelineSummary,
		current: number,
		total: number,
		meta: PipelineTrackMeta,
		status: PipelineProgressStatus,
		detail?: string,
	) => void = function (current, total, meta, status, detail) {
		reportPipelineProgress(this, opts.dryRun || false, current, total, meta, status, detail);
	},
): Promise<PipelineSummary> {
	const summary = {
		total: pending.length,
		accepted: 0,
		ignored: 0,
		failed: 0,
	};

	const onProgress = $onProgress.bind(summary);
	const delay = opts.delayMs ?? 100;

	for (const [i, entry] of pending.entries()) {
		const { meta, context } = entry;

		if (opts.dryRun) {
			summary.accepted++, onProgress(i + 1, pending.length, meta, "ok");
			continue;
		}

		try {
			const result: ScrobbleResult = await withRetryR(
				() => scrobble(opts.config.apiKey, opts.config.secret, opts.config.sessionKey, meta),
				{
					maxAttempts: 4,
					baseDelayMs: 500,
					retryIf: isRetryable,
					onRetry: (attempt, delayMs) => {
						console.error(
							`  ${symbols.retry} retry ${dim(`${attempt}`)} for ${yellow(meta.title)} in ${dim(`${delayMs}ms`)}...`,
						);
					},
				},
			);

			if (result.ignored) {
				summary.ignored += result.ignored;
				onProgress(i + 1, pending.length, meta, "ignored");
			} else if (result.accepted) {
				summary.accepted += result.accepted;
				onProgress(i + 1, pending.length, meta, "ok");
			}

			if (opts.commitSuccess) {
				const commitResult = await opts.commitSuccess(context);
				if (!commitResult.ok) {
					console.error(
						`  ${symbols.warn} failed to persist state for ${yellow(meta.title)}: ${dim(describe(commitResult.error))}`,
					);
				}
			}
		} catch (e) {
			summary.failed++;
			onProgress(i + 1, pending.length, meta, "failed", describe(e as AppError));
		}

		if (i < pending.length - 1) await sleep(delay);
	}

	return summary;
}

/**
 * assigns a quasi-uniformly spaced timestamp to a track with a or date that's either older than 14 days
 * or missing.
 *
 * t₀ = (now − 14 days), with fixed increment Δt = 30 s per track.
 */
export function generateTimestamp(index: number, jitter = 10): number {
	const t0 = Math.floor(Date.now() / 1_000) - TIMESTAMP_LIMIT;

	// uniform noise ε ∈ [-jitter, +jitter]
	const epsilon = Math.floor((Math.random() * 2 - 1) * jitter);
	return t0 + index * 30 + epsilon;
}

export function resolveTimestamp(index: number, input?: string | number): number {
	let ts: number | undefined;

	if (typeof input === "number") {
		ts = input > 1e9 ? input : undefined;
	} else if (input) {
		const parsed = Date.parse(input);
		if (!isNaN(parsed)) {
			ts = Math.floor(parsed / 1000);
		}
	}

	if (ts !== undefined) {
		const now = Math.floor(Date.now() / 1000);
		if (now - ts <= TIMESTAMP_LIMIT) {
			return ts;
		}
	}

	return generateTimestamp(index);
}
