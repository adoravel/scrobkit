import { Fail, Ok, Result as $Result } from "~/lib/result.ts";
import { Errors } from "~/lib/errors.ts";

export const SKIP_PREFIX = "#SKIP:";

const COLUMNS = ["artist", "album", "title", "date"] as const;

export interface Track {
	artist: string;
	album: string;
	title: string;
	date: string;
}

export interface CsvDocument {
	path: string;
	rawLines: string[];
	pending: Array<{ track: Track; lineIndex: number }>;
	skippedCount: number;
}

type Result<T> = $Result<T, ReturnType<typeof Errors.csv>>;

export function loadCsvDocument(path: string): Result<CsvDocument> {
	let raw: string;
	try {
		raw = Deno.readTextFileSync(path);
	} catch (e) {
		if (e instanceof Deno.errors.NotFound) {
			return Fail(Errors.csv("not_found", `File '${path}' not found`, path));
		}
		return Fail(Errors.csv("parse_failed", e instanceof Error ? e.message : String(e), path));
	}

	const rawLines = raw.split("\n");
	const pending: CsvDocument["pending"] = [];
	let skippedCount = 0;

	for (let i = 0; i < rawLines.length; i++) {
		const line = rawLines[i];

		if (!line.trim()) {
			continue;
		}

		if (line.startsWith(SKIP_PREFIX)) {
			skippedCount++;
			continue;
		}

		const parsed = parse(line, i, path);
		if (!parsed.ok) return parsed;

		pending.push({ track: parsed.value, lineIndex: i });
	}

	return Ok({ path, rawLines, pending, skippedCount });
}

export function markSkipped(
	doc: CsvDocument,
	index: number,
): Result<CsvDocument> {
	const line = doc.rawLines[index];

	if (line === undefined) {
		return Fail(Errors.csv("write_failed", `Line ${index} out of bounds`, doc.path));
	}

	if (line.startsWith(SKIP_PREFIX)) {
		return Ok(doc);
	}

	const rawLines = [...doc.rawLines];
	rawLines[index] = `${SKIP_PREFIX}${line}`;

	try {
		Deno.writeTextFileSync(doc.path, rawLines.join("\n"));
	} catch (e) {
		return Fail(Errors.csv("write_failed", e instanceof Error ? e.message : String(e), doc.path));
	}

	return Ok({ ...doc, rawLines });
}

export function saveCsvDocument(path: string, tracks: Track[]): Result<void> {
	const header = COLUMNS.join(",");
	const rows = tracks.map((t) => [escape(t.artist), escape(t.album), escape(t.title), escape(t.date)].join(","));

	try {
		Deno.writeTextFileSync(path, [header, ...rows].join("\n") + "\n");
		return Ok(undefined);
	} catch (e) {
		return Fail(Errors.csv("write_failed", e instanceof Error ? e.message : String(e), path));
	}
}

function parse(
	line: string,
	index: number,
	path: string,
): Result<Track> {
	const fields = split(line);

	if (fields.length < 3) {
		return Fail(
			Errors.csv(
				"invalid_columns",
				`Line ${index + 1}: expected at least 3 columns (artist, album, title), got ${fields.length}`,
				path,
			),
		);
	}

	if (fields[0].toLowerCase() === "artist") {
		return Fail(Errors.csv("invalid_columns", "header row", path));
	}

	return Ok({
		artist: unescape(fields[0] ?? ""),
		album: unescape(fields[1] ?? ""),
		title: unescape(fields[2] ?? ""),
		date: unescape(fields[3] ?? ""),
	});
}

function split(line: string): string[] {
	const fields: string[] = [];
	let current = "";
	let inQuotes = false;

	for (let i = 0; i < line.length; i++) {
		const ch = line[i];

		if (ch === '"') {
			if (inQuotes && line[i + 1] === '"') {
				current += '"';
				i++;
			} else {
				inQuotes = !inQuotes;
			}
		} else if (ch === "," && !inQuotes) {
			fields.push(current);
			current = "";
		} else {
			current += ch;
		}
	}

	return fields.push(current), fields;
}

function escape(value: string): string {
	if (value.includes(",") || value.includes('"') || value.includes("\n")) {
		return `"${value.replace(/"/g, '""')}"`;
	}
	return value;
}

function unescape(value: string): string {
	if (value.startsWith('"') && value.endsWith('"')) {
		return value.slice(1, -1).replace(/""/g, '"');
	}
	return value;
}

export { type Result as CsvResult };
