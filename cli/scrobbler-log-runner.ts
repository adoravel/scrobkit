import { PendingEntry, PipelineOptions, PipelineSummary, runPipeline } from "~/cli/pipeline.ts";
import { describe } from "~/lib/errors.ts";
import { ScrobblerLogTrack } from "~/lib/format/scrobbler-log/mod.ts";
import { deleteLog, readScrobblerLog } from "~/lib/format/scrobbler-log/io.ts";

type ScrobblerLogContext = Record<PropertyKey, never>;

function toPendingEntry(track: ScrobblerLogTrack): PendingEntry<ScrobblerLogContext> {
	return {
		meta: {
			artist: track.title,
			album: track.album || undefined,
			title: track.title,
			timestamp: track.timestamp,
		},
		context: {},
	};
}

export async function runScrobblerLogPipeline(
	path: string,
	opts: PipelineOptions<ScrobblerLogContext>,
	onProgress: (current: number, total: number, meta: any, status: any, detail?: string) => void,
): Promise<PipelineSummary> {
	const log = await readScrobblerLog(path);
	if (!log.ok) throw new Error(log.error.message);

	const pending = log.value.tracks.map(toPendingEntry);
	const summary = await runPipeline<ScrobblerLogContext>(pending, { ...opts }, onProgress);

	if (summary.failed === 0 && !opts.dryRun) {
		console.log(`\n  \u2713 sync complete, removing .scrobbler.log...`);
		await deleteLog(path);
	} else if (summary.failed > 0) {
		console.warn(`\n  \u2640 ${summary.failed} tracks failed, log file preserved for next sync.`);
	}

	return summary;
}
