import { Errors } from "~/lib/errors.ts";
import { CsvDocument, SKIP_PREFIX } from "~/lib/format/csv/mod.ts";
import { parseTrack, serializeHeader, serializeTrack } from "~/lib/format/csv/codec.ts";
import { Fail, Ok, Result } from "~/lib/result.ts";
import { DocumentTrack } from "~/lib/csv.ts";

type IOError = ReturnType<typeof Errors.csv>;

export async function loadCsvDocument(path: string): Promise<Result<CsvDocument, IOError>> {
	let raw: string;
	try {
		raw = await Deno.readTextFile(path);
	} catch (e) {
		if (e instanceof Deno.errors.NotFound) {
			return Fail(Errors.csv("not_found", `file '${path}' not found`, path));
		}
		return Fail(Errors.csv("parse_failed", e instanceof Error ? e.message : String(e), path));
	}

	const rawLines = raw.split("\n");

	const pending: CsvDocument["pending"][number][] = [];
	let skippedCount = 0;

	for (let i = 0; i < rawLines.length; i++) {
		const line = rawLines[i];

		if (!line.trim()) continue;
		if (line.startsWith(SKIP_PREFIX)) {
			skippedCount++;
			continue;
		}

		const parsed = parseTrack(line, i, path);
		if (!parsed.ok) return parsed;

		pending.push({ track: parsed.value, lineIndex: i });
	}

	return Ok({ path, rawLines, pending, skippedCount });
}

/**
 * appends the skip prefix to a specific line in the document and writes to disk
 */
export async function markSkipped(
	doc: CsvDocument,
	index: number,
): Promise<Result<CsvDocument, IOError>> {
	const line = doc.rawLines[index];

	if (line === undefined) {
		return Fail(Errors.csv("write_failed", `line ${index} out of bounds`, doc.path));
	}

	if (line.startsWith(SKIP_PREFIX)) {
		return Ok(doc);
	}

	// shallow copy <3
	const body = [...doc.rawLines];
	body[index] = `${SKIP_PREFIX} ${line}`;

	try {
		await Deno.writeTextFile(doc.path, body.join("\n"));
	} catch (e) {
		return Fail(Errors.csv("write_failed", e instanceof Error ? e.message : String(e), doc.path));
	}

	return Ok({ ...doc, rawLines: body });
}

/**
 * creates or overwrites a document file with a provided list of tracks
 */
export async function saveCsvDocument(path: string, tracks: readonly DocumentTrack[]): Promise<Result<void, IOError>> {
	const header = serializeHeader();
	const rows = tracks.map(serializeTrack);

	try {
		await Deno.writeTextFile(path, [header, ...rows].join("\n") + "\n");
		return Ok(undefined);
	} catch (e) {
		return Fail(Errors.csv("write_failed", e instanceof Error ? e.message : String(e), path));
	}
}
