import { Fail, Ok, Result } from "~/lib/result.ts";
import { AppError, describe, Errors } from "~/lib/errors.ts";
import { matchesFilters, TrackFilters } from "~/lib/filter.ts";
import { parseArgs } from "@std/cli";
import { requireBaseConfig } from "~/cli/bootstrap.ts";
import { dim, log } from "~/cli/formatter.ts";
import { getAllRecentTracks } from "~/api/lastfm.ts";
import { serializeHeader, serializeTrack } from "~/lib/format/csv/codec.ts";

const HELP_TEXT = `
Usage: scrobkit export [options...] <output_path>

Arguments:
  <output_path>      Path to save the exported CSV file.

Options:
  -u, --user <name>   Last.fm user to fetch history from.
  -f, --from <date>   Start date (e.g. "2023-01-01" or Unix timestamp)
  -t, --to <date>     End date (e.g. "2023-12-31" or Unix timestamp)
  -a, --artist <name> Filter by artist name (substring match)
  -l, --album <name>  Filter by album name (substring match)
  -h, --help          Show this help message
`;

function parseDateInput(input?: string): number | undefined {
	if (!input) return undefined;
	const asNum = Number(input);
	if (!isNaN(asNum)) return asNum;
	const parsed = Date.parse(input);
	if (!isNaN(parsed)) return Math.floor(parsed / 1000);
	throw new Error(`Invalid date format: "${input}". Use YYYY-MM-DD or a Unix timestamp.`);
}

function writeStdout(text: string): void {
	Deno.stdout.writeSync(new TextEncoder().encode(text));
}

export async function executeExportCommand(args: string[] = Deno.args): Promise<Result<void, AppError>> {
	const flags = parseArgs(args, {
		string: ["from", "to", "artist", "album", "user"],
		alias: { f: "from", t: "to", a: "artist", l: "album", h: "help", u: "user" },
		boolean: ["help"],
	});

	if (flags.help || !flags.user?.trim() || !flags._?.toString()?.trim()) {
		console.log(HELP_TEXT);
		Deno.exit(0);
	}

	const path = flags._.toString();

	let filters: TrackFilters;
	try {
		filters = {
			from: parseDateInput(flags.from),
			to: parseDateInput(flags.to),
			artist: flags.artist,
			album: flags.album,
		};
	} catch (e) {
		return Fail(Errors.config("parse_failed", (e as Error).message));
	}

	const config = await requireBaseConfig();
	if (!config.ok) return config;

	let file: Deno.FsFile;
	try {
		file = await Deno.open(path, { write: true, create: true, truncate: true });
		await file.write(new TextEncoder().encode(serializeHeader() + "\n"));
	} catch (e) {
		return Fail(Errors.config("write_failed", e instanceof Error ? e.message : String(e)));
	}

	writeStdout(`  Fetching history from Last.fm... ${dim("0 / ?")}`);
	let fetched = 0, matched = 0;

	const previewQueue: string[] = [];
	let lastFrameHeight = 0;

	try {
		const encoder = new TextEncoder();

		for await (
			const pageTracks of getAllRecentTracks(config.value.apiKey, flags.user, {
				from: filters.from,
				to: filters.to,
			})
		) {
			fetched += pageTracks.length;

			for (const track of pageTracks) {
				if (matchesFilters(track, filters)) {
					matched++;
					const row = serializeTrack({
						...track,
						date: track.timestamp?.toString() ?? "",
					});
					await file.write(encoder.encode(row + "\n"));

					previewQueue.push(`${track.artist} - ${track.title}`);
					while (previewQueue.length > 5) previewQueue.shift();
				}
			}

			const currentFrameHeight = previewQueue.length + (matched > 5 ? 1 : 0);
			if (lastFrameHeight) {
				writeStdout(`\x1b[${lastFrameHeight}A`);
			}

			writeStdout("\x1b[0J");
			writeStdout(`\r  Fetching history from Last.fm... ${dim(`(${fetched} fetched [${matched} matched])`)}`);

			if (previewQueue.length) {
				writeStdout(`\n    ${dim(previewQueue.join("\n    "))}`);
				if (matched > 5) {
					writeStdout(`\n    ${dim("...")}\r`);
				}
			}
			lastFrameHeight = currentFrameHeight;
		}
	} catch (e) {
		writeStdout("\x1b[1A\x1b[0J");
		writeStdout("\r" + " ".repeat(80) + "\r");
		if (e instanceof Error) log.error(e.message);

		const error = e as AppError;
		if (error.kind === "network" && error.tag === 403) {
			log.error(
				"Failed to fetch history (HTTP 403). This usually means the user's listening history is set to private.",
			);
		} else {
			log.error("Export failed unexpectedly.");
			log.error(describe(error));
		}

		Deno.exit(1);
	} finally {
		file.close();
	}

	writeStdout("\n");
	log.success(`Exported ${dim(`${matched}`)} tracks ${dim(`(out of ${fetched} fetched)`)} to ${dim(path)}`);

	return Ok(void 0);
}
