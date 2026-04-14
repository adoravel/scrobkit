import { Errors } from "~/lib/errors.ts";
import { ClientIdentification, ScrobblerLogHeader, ScrobblerLogTrack } from "~/lib/format/scrobbler-log/mod.ts";
import { Fail, Ok, Result } from "~/lib/result.ts";

type ParseError = ReturnType<typeof Errors.scrobblerLog>;

const FIELD_COUNT = 8;
const TAB = "\t";

function createMusicBrainzId(value: string): Result<string, ParseError> {
	const stripped = value.trim();
	const pattern = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
	if (stripped.length && !pattern.test(stripped)) {
		return Fail(Errors.scrobblerLog("invalid_field", "musicBrainz id must be a valid UUID"));
	}
	return Ok(stripped);
}

function serializeClient(client: ClientIdentification): string {
	const parts = [client.device, client.model, client.revision].filter(Boolean);
	return parts.join(" ");
}

export function serializeHeader(header: ScrobblerLogHeader): readonly string[] {
	return [
		`#AUDIOSCROBBLER/${header.version}`,
		`#TZ/${header.timezone.kind.toUpperCase()}`,
		`#CLIENT/${serializeClient(header.client)}`,
	];
}

// the spec mandates: [...] "strip any tab characters from the data"
function sanitize(str: string): string {
	return str.replace(/\t/g, " ");
}

export function serializeTrack(track: ScrobblerLogTrack): string {
	const fields: string[] = [
		sanitize(track.artist),
		sanitize(track.album ?? ""),
		sanitize(track.title),
		track.trackIndex?.toString() ?? "",
		track.duration.toString(),
		track.rating,
		track.timestamp.toString(),
		sanitize(track.musicBrainzId ?? ""),
	];
	return fields.join(TAB);
}

function parseHeaderLine(line: string): Result<Partial<ScrobblerLogHeader>, ParseError> {
	if (!line.startsWith("#")) {
		return Fail(Errors.scrobblerLog("parse_failed", "header line must start with #"));
	}

	const [directive, ...rest] = line.slice(1).split("/");
	const value = rest.join("/"); // sanity purposes

	switch (directive) {
		case "AUDIOSCROBBLER":
			if (value !== "1.1") {
				return Fail(Errors.scrobblerLog("unsupported_version", `version ${value} is unsupported`));
			}
			return Ok({ version: value as ScrobblerLogHeader["version"] });
		case "TZ": {
			const tz = value.toLowerCase();
			if (tz === "utc" || tz === "unknown") return Ok({ timezone: { kind: tz } });
			return Fail(Errors.scrobblerLog("invalid_field", `invalid timezone: ${value}`));
		}
		case "CLIENT":
			return Ok({ client: { device: value, revision: "1.0" } });
		default:
			// forward compatibility
			return Ok({});
	}
}

export function parseHeader(lines: string[]): Result<ScrobblerLogHeader, ParseError> {
	let header: Partial<ScrobblerLogHeader> = {};

	for (const line of lines) {
		if (!line.startsWith("#")) break; // headers end at first non-comment line

		const result = parseHeaderLine(line);
		if (!result.ok) return result;
		header = { ...header, ...result.value };
	}

	if (!header.version) return Fail(Errors.scrobblerLog("parse_failed", "missing version header"));
	if (!header.timezone) return Fail(Errors.scrobblerLog("parse_failed", "missing timezone header"));
	if (!header.client) return Fail(Errors.scrobblerLog("parse_failed", "missing client header"));

	return Ok(header as ScrobblerLogHeader);
}

export function parseTrack(line: string): Result<ScrobblerLogTrack, ParseError> {
	const fields = line.split(TAB);
	if (fields.length !== FIELD_COUNT) {
		return Fail(Errors.scrobblerLog("invalid_columns", `Expected ${FIELD_COUNT} fields, got ${fields.length}`));
	}

	const [artist, album, title, $trackIndex, rawDuration, rating, $timestamp, $mbId] = fields;

	if (!artist) {
		return Fail(Errors.scrobblerLog("invalid_field", "artist must not be empty"));
	}
	if (!title) {
		return Fail(Errors.scrobblerLog("invalid_field", "title must not be empty"));
	}

	const duration = parseInt(rawDuration, 10);
	if (isNaN(duration)) return Fail(Errors.scrobblerLog("invalid_field", "duration must be a number"));

	if (rating !== "L" && rating !== "S") {
		return Fail(Errors.scrobblerLog("invalid_field", "rating must be either 'L' or 'S'"));
	}

	const timestamp = typeof $timestamp === "string" ? parseInt($timestamp, 10) : $timestamp;
	if (isNaN(timestamp) || timestamp < 0) {
		return Fail(Errors.scrobblerLog("invalid_field", "timestamp must be a positive number"));
	}

	const trackIndex = $trackIndex ? parseInt($trackIndex, 10) : undefined;
	if (trackIndex !== undefined && isNaN(trackIndex)) {
		return Fail(Errors.scrobblerLog("invalid_field", "track number must be a valid number"));
	}

	const musicBrainzId = $mbId ? createMusicBrainzId($mbId) : Ok(undefined);
	if (!musicBrainzId.ok) return musicBrainzId;

	return Ok({
		artist,
		album,
		title,
		trackIndex,
		duration,
		rating,
		timestamp,
		musicBrainzId: musicBrainzId.value,
	});
}
