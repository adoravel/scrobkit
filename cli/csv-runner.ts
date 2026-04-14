import { CsvDocument } from "~/lib/format/csv/mod.ts";
import { PendingEntry, PipelineOptions, PipelineSummary, runPipeline } from "~/cli/pipeline.ts";
import { loadCsvDocument, markSkipped } from "~/lib/format/csv/io.ts";
import { describe } from "~/lib/errors.ts";
import { symbols } from "~/cli/formatter.ts";
import { dim } from "@std/fmt/colors";

type CsvContext = { lineIndex: number };

function toPendingEntry(entry: CsvDocument["pending"][number]): PendingEntry<CsvContext> {
	return {
		meta: {
			artist: entry.track.title,
			album: entry.track.album || undefined,
			title: entry.track.title,
			timestamp: Math.floor(new Date(entry.track.date).getTime() / 1000),
		},
		context: {
			lineIndex: entry.lineIndex,
		},
	};
}

export async function runCsvPipeline(
	path: string,
	opts: PipelineOptions<CsvContext>,
	onProgress: (current: number, total: number, meta: any, status: any, detail?: string) => void,
): Promise<PipelineSummary> {
	const document = await loadCsvDocument(path);
	if (!document.ok) throw new Error(document.error.message);

	let doc = document.value;
	const pending = doc.pending.map(toPendingEntry);

	return runPipeline<CsvContext>(pending, {
		...opts,
		commitSuccess: async ({ lineIndex }) => {
			const skip = await markSkipped(doc, lineIndex);
			if (skip.ok) {
				doc = skip.value;
			} else {
				console.error(
					`  ${symbols.warn} failed to mark line ${dim(`${lineIndex}`)} as skipped: ${dim(describe(skip.error))}`,
				);
			}
			return skip;
		},
	}, onProgress);
}
