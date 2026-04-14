import { ScrobblerLogHeader, ScrobblerLogTrack } from "~/lib/format/scrobbler-log/mod.ts";
import { parseHeader, parseTrack, serializeHeader, serializeTrack } from "~/lib/format/scrobbler-log/codec.ts";
import { Errors } from "~/lib/errors.ts";
import { Fail, Ok, Result } from "~/lib/result.ts";
import { join } from "@std/path";

const FILENAME = ".scrobbler.log";
const NEWLINE = "\n";

export interface ScrobblerLogPayload {
	readonly header: ScrobblerLogHeader;
	readonly tracks: readonly ScrobblerLogTrack[];
}

type IOError = ReturnType<typeof Errors.scrobblerLog>;

/**
 * determine if a header needs to be prepended to a log entry.
 */
function withHeaderIfNeeded(
	path: string,
	header: ScrobblerLogHeader,
	line: string,
	fileExists: (p: string) => boolean,
): { body: string; shouldAppend: boolean } {
	if (!fileExists(path)) {
		const headerLines = serializeHeader(header).join(NEWLINE);
		return { body: `${headerLines}${NEWLINE}${line}`, shouldAppend: false };
	}
	return { body: line, shouldAppend: true };
}

export async function readScrobblerLog(input: string): Promise<Result<ScrobblerLogPayload, IOError>> {
	let raw: string;
	let path = input;

	try {
		if ((await Deno.stat(path)).isDirectory) {
			path = join(input, FILENAME);
		}
		raw = await Deno.readTextFile(path);
	} catch (e) {
		if (e instanceof Deno.errors.NotFound) {
			return Fail(Errors.scrobblerLog("not_found", `log file not found at ${path}`));
		}
		return Fail(Errors.scrobblerLog("read_failed", e instanceof Error ? e.message : String(e)));
	}

	const lines = raw.split(NEWLINE).filter((line) => line.length);

	const header = parseHeader(lines);
	if (!header.ok) return header;

	const headerLength = lines.filter((l) => l.startsWith("#")).length;
	const body = lines.slice(headerLength);

	const tracks: ScrobblerLogTrack[] = [];
	for (const meow of body) {
		const track = parseTrack(meow);
		if (!track.ok) continue;
		tracks.push(track.value);
	}

	return Ok({ header: header.value, tracks });
}

/**
 * appends a single track to an existing log, or creates a new log if it doesn't exist.
 */
export async function appendTrack(
	directory: string,
	header: ScrobblerLogHeader,
	track: ScrobblerLogTrack,
): Promise<Result<void, IOError>> {
	const path = join(directory, FILENAME);
	const line = serializeTrack(track) + NEWLINE;

	try {
		const { body, shouldAppend: append } = withHeaderIfNeeded(path, header, line, (p) => {
			try {
				Deno.statSync(p);
				return true;
			} catch (e) {
				if (e instanceof Deno.errors.NotFound) return false;
				throw e; // propagate actual i/o errors to the outer catch
			}
		});

		await Deno.writeTextFile(path, body, { append });
		return Ok(undefined);
	} catch (e) {
		return Fail(Errors.scrobblerLog("write_failed", e instanceof Error ? e.message : String(e)));
	}
}

/**
 * creates a new .scrobbler.log file, overwriting any existing one.
 */
export async function createLog(
	directory: string,
	$header: ScrobblerLogHeader,
	$tracks: readonly ScrobblerLogTrack[] = [],
): Promise<Result<void, IOError>> {
	const path = join(directory, FILENAME);

	const hader = serializeHeader($header).join(NEWLINE);
	const tracks = $tracks.map(serializeTrack).join(NEWLINE);

	const body = [hader, tracks].filter(Boolean).join(NEWLINE) + NEWLINE;

	try {
		await Deno.writeTextFile(path, body);
		return Ok(undefined);
	} catch (e) {
		return Fail(Errors.scrobblerLog("write_failed", e instanceof Error ? e.message : String(e)));
	}
}

/**
 * safely deletes the log file. done after successful synchronisation, in compliance with the spec
 */
export async function deleteLog(directory: string): Promise<Result<void, IOError>> {
	const path = join(directory, FILENAME);
	try {
		await Deno.remove(path);
		return Ok(undefined);
	} catch (e) {
		if (e instanceof Deno.errors.NotFound) {
			return Ok(undefined);
		}
		return Fail(Errors.scrobblerLog("write_failed", e instanceof Error ? e.message : String(e)));
	}
}
