import { parseArgs } from "@std/cli";
import { requireBaseConfig } from "~/cli/bootstrap.ts";
import { ensureSession } from "~/cli/session.ts";
import { getAllRecentTracks, scrobble } from "~/api/lastfm.ts";
import { dim, log } from "~/cli/formatter.ts";
import { Ok, Result } from "~/lib/result.ts";
import { AppError } from "~/lib/errors.ts";
import { ensureBrowserSession } from "~/browser/session.ts";
import { normaliseArtistMetadata } from "~/api/lotus.ts";
import { deleteScrobble } from "~/browser/lastfm.ts";
import { sleep, withRetry } from "~/utils/retry.ts";
import { cyan, green, italic, red } from "@std/fmt/colors";
import { TIMESTAMP_LIMIT } from "~/cli/pipeline.ts";

const CORRECTION_CUTOFF = Math.floor(Date.now() / 1000) - TIMESTAMP_LIMIT;

export async function executeTidyCommand(args: string[]): Promise<Result<void, AppError>> {
	const flags = parseArgs(args, {
		boolean: ["dry-run"],
		alias: { n: "dry-run" },
	});

	const config = await requireBaseConfig();
	if (!config.ok) return config;

	const session = await ensureSession(config.value);
	if (!session.ok) return session;

	const browser = ensureBrowserSession(session.value);
	if (!browser) return Ok(void 0);

	const prefix = flags["dry-run"] ? `  \u{1F6E0}  ${italic("dry run")}  ` : "  ";
	log.info(`${prefix}Scanning 14-day history for metadata issues...`);

	let skipCount = 0;
	const MAX_SHOWN_SKIPS = 3;

	outer: for await (const page of getAllRecentTracks(session.value.apiKey, session.value.username, { limit: 50 })) {
		for (const track of page) {
			if (!track.timestamp) continue;
			if (Number(track.timestamp) <= CORRECTION_CUTOFF) break outer;

			const metadata = { artist: normaliseArtistMetadata(track.artist), title: track.title, album: track.album };

			if (metadata.artist.toLowerCase() === track.artist.toLowerCase()) {
				if (skipCount++ <= MAX_SHOWN_SKIPS) {
					log.info(`  ${dim("skip")}  ${dim(track.artist + " — " + track.title)}`);
				}
				continue;
			}

			if (skipCount > MAX_SHOWN_SKIPS) {
				log.info(`  ${dim("...")}   ${dim(`skipped ${skipCount - MAX_SHOWN_SKIPS} more tracks`)}`);
			}

			skipCount = 0;
			const timestamp = new Date(track.timestamp * 1000).toLocaleString();

			log.warn(
				`  ${dim("tidy")}   ${red(track.artist)} → ${green(metadata.artist)} ${
					dim(`(${track.title}) ${dim("@ " + timestamp)}`)
				}`,
			);

			if (flags["dry-run"]) continue;

			const deletion = await withRetry(() =>
				deleteScrobble(browser, {
					artist: track.artist,
					timestamp: track.timestamp!,
					track: track.title,
				})
			);

			if (!deletion.ok) {
				log.error(`      ${dim("fail")} deletion </3: ${deletion.error.message}`);
				continue;
			}

			const add = await withRetry(() =>
				scrobble(session.value.apiKey, session.value.secret, session.value.sessionKey, {
					...metadata,
					timestamp: track.timestamp!,
				})
			);

			if (!add.ok || !add.value.accepted) {
				log.error(`      ${dim("fail")} resubmission qwq`);
				continue;
			}

			log.success(`  ${dim("done")}   ${cyan(metadata.artist)} — ${metadata.title} ${dim("@ " + timestamp)}`);
		}
		sleep(100);
	}

	log.info("  finished tidying history :3");
	return Ok(void 0);
}
