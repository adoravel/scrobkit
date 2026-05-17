import { Errors } from "~/lib/errors.ts";
import { columnFields, type DocumentTrack } from "~/lib/format/csv/mod.ts";
import { Fail, Ok, Result } from "~/lib/result.ts";

type ParseError = ReturnType<typeof Errors.csv>;

type ColumnIndices = Record<(typeof columnFields)[number], number>;

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
	header?: ColumnIndices,
): Result<DocumentTrack, ParseError> {
	const fields = split(line);

	const headers = getPossibleHeaders(fields);
	for (const h of headers) {
		if (h.join(",") === line) {
			return Fail(Errors.csv("invalid_columns", "header row", path));
		}
	}

	if (fields.length < 3) {
		return Fail(
			Errors.csv(
				"invalid_columns",
				`Line ${lineIndex + 1}: expected at least 3 columns (artist, album, title), got ${fields.length}`,
				path,
			),
		);
	}

	if (!header) {
		return Ok({
			artist: unescape(fields[0] ?? ""),
			album: unescape(fields[1] ?? ""),
			title: unescape(fields[2] ?? ""),
			date: unescape(fields[3] ?? ""),
		});
	}

	return Ok({
		artist: unescape(fields[header.artist]),
		albumArtist: unescape(fields[header.album_artist] ?? ""),
		album: unescape(fields[header.album] ?? ""),
		title: unescape(fields[header.title]),
		date: unescape(fields[header.date] ?? ""),
	});
}

export function serializeTrack(track: DocumentTrack): string {
	return [track.artist, track.albumArtist ?? "", track.album, track.title, track.date].map(escape).join(",");
}

export function serializeHeader(): string {
	return columnFields.join(",");
}

function getPossibleHeaders(segments: string[]): (readonly string[])[] {
	if (segments.length === 5) {
		return [columnFields];
	}
	if (segments.length === 4) {
		return [columnFields.filter((f) => f !== "album_artist"), columnFields.filter((f) => f !== "date")];
	}

	return [["artist", "album", "title"]];
}

export function getColumnIndices(line: string): Result<ColumnIndices, ParseError> {
	const fields = split(line);
	const returns: Record<string, number> = {};

	const requiredFields = ["artist", "title"];

	columnFields.forEach((val) => {
		for (let i = 0; i < fields.length; i++) {
			const field = fields[i];

			if (val === field) {
				returns[val] = i;
				break;
			}
		}
	});

	for (const required of requiredFields) {
		if (!Object.keys(returns).includes(required)) {
			return Fail(Errors.csv(
				"required_header_fields_missing",
				`expected at least ${requiredFields.length} header fields (${requiredFields.join(", ")})`,
			));
		}
	}

	return Ok(returns as ColumnIndices);
}
