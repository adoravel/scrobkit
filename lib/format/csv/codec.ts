import { Errors } from "~/lib/errors.ts";
import { CSV_HEADER } from "~/lib/format/csv/mod.ts";
import { DocumentTrack } from "~/lib/csv.ts";
import { Fail, Ok, Result } from "~/lib/result.ts";

type ParseError = ReturnType<typeof Errors.csv>;

// https://www.rfc-editor.org/rfc/rfc4180.html
export function split(line: string): string[] {
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

	fields.push(current);
	return fields;
}

/**
 * escapes a string to be safely embedded in a row
 */
export function escape(value: string): string {
	if (value.includes(",") || value.includes('"') || value.includes("\n")) {
		return `"${value.replace(/"/g, '""')}"`;
	}
	return value;
}

export function unescape(value: string): string {
	if (value.startsWith('"') && value.endsWith('"')) {
		return value.slice(1, -1).replace(/""/g, '"');
	}
	return value;
}

export function parseTrack(
	line: string,
	lineIndex: number,
	path: string,
): Result<DocumentTrack, ParseError> {
	const fields = split(line);

	if (fields.length < 3) {
		return Fail(
			Errors.csv(
				"invalid_columns",
				`Line ${lineIndex + 1}: expected at least 3 columns (artist, album, title), got ${fields.length}`,
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

export function serializeTrack(track: DocumentTrack): string {
	return [track.artist, track.album, track.title, track.date].map(escape).join(",");
}

export function serializeHeader(): string {
	return CSV_HEADER.join(",");
}
