import { PendingEntry, PipelineOptions, PipelineSummary, resolveTimestamp, runPipeline } from "~/cli/pipeline.ts";
import { ScrobblerLogTrack } from "~/lib/format/scrobbler-log/mod.ts";
import { deleteLog, readScrobblerLog } from "~/lib/format/scrobbler-log/io.ts";
import { symbols } from "~/cli/formatter.ts";
import { dim } from "@std/fmt/colors";

type ScrobblerLogContext = Record<PropertyKey, never>;

function toPendingEntry(track: ScrobblerLogTrack, index: number): PendingEntry<ScrobblerLogContext> {
	return {
		meta: {
			artist: track.artist,
			album: track.album || undefined,
			title: track.title,
			timestamp: resolveTimestamp(index, track.timestamp),
		},
		context: {},
	};
}

export async function runScrobblerLogPipeline(
	path: string,
	opts: PipelineOptions<ScrobblerLogContext>,
): Promise<PipelineSummary> {
	const log = await readScrobblerLog(path);
	if (!log.ok) throw new Error(log.error.message);

	const tracks = log.value.tracks.filter((track) => {
		if (track.rating === "S") {
			console.warn(`${symbols.forbid} Ignored by .scrobbler.log: ${dim(`"${track.artist} - ${track.title}"`)}`);
			return false;
		}
		return true;
	});

	const pending = tracks.map(toPendingEntry);
	const summary = await runPipeline<ScrobblerLogContext>(pending, { ...opts });

	if (summary.failed === 0 && !opts.dryRun) {
		console.log(`\n  \u2713 sync complete, removing .scrobbler.log...`);
		await deleteLog(path);
	} else if (summary.failed > 0) {
		console.warn(`\n  \u2640 ${summary.failed} tracks failed, log file preserved for next sync.`);
	}

	return summary;
}
