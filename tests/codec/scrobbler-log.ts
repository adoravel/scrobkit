import { ScrobblerLogHeader, ScrobblerLogTrack } from "~/lib/format/scrobbler-log/mod.ts";
import { parseHeader, parseTrack, serializeHeader, serializeTrack } from "~/lib/format/scrobbler-log/codec.ts";
import { assert, assertEquals } from "jsr:@std/assert@1.0.19";

const MOCK_HEADER: ScrobblerLogHeader = {
	version: "1.1",
	timezone: { kind: "utc" },
	client: { device: "Rockbox h3xx", revision: "1.1" },
};

const MOCK_TRACK: ScrobblerLogTrack = {
	artist: "Yui Horie",
	album: "The♡World's♡End",
	title: "The♡World’s♡End",
	trackIndex: 1,
	duration: 307,
	rating: "L",
	timestamp: 1672531200,
	musicBrainzId: "6a0a572c-a96a-4cff-8c9d-f132b0d2b9e9",
};

Deno.test(".scrobbler.log Codec: serializeHeader() matches spec", () => {
	const lines = serializeHeader(MOCK_HEADER);
	assertEquals(lines, [
		"#AUDIOSCROBBLER/1.1",
		"#TZ/UTC",
		"#CLIENT/Rockbox h3xx 1.1",
	]);
});

Deno.test(".scrobbler.log Codec: serializeTrack() joins with tabs", () => {
	const line = serializeTrack(MOCK_TRACK);
	const parts = line.split("\t");
	assertEquals(parts.length, 8);
	assertEquals(parts[0], "Yui Horie");
	assertEquals(parts[4], "307");
	assertEquals(parts[5], "L");
});

Deno.test("Scrobbler Codec: serializeTrack() sanitizes tabs in data", () => {
	const dirtyTrack = { ...MOCK_TRACK, artist: "Art\tist" };
	const line = serializeTrack(dirtyTrack);
	assert(!line.includes("Art\tist"), "Tabs must be replaced");
	assert(line.includes("Art ist"), "Tabs should be replaced with spaces");
});

Deno.test("Scrobbler Codec: parseHeader() parses valid header block", () => {
	const rawLines = [
		"#AUDIOSCROBBLER/1.1",
		"#TZ/UTC",
		"#CLIENT/Rockbox h3xx 1.1",
		"Artist\tAlbum\t...",
	];
	const result = parseHeader(rawLines);
	assert(result.ok);
	assertEquals(result.value.client.device, "Rockbox h3xx 1.1");
	assertEquals(result.value.timezone.kind, "utc");
});

Deno.test("Scrobbler Codec: parseHeader() handles UNKNOWN timezone", () => {
	const rawLines = ["#TZ/UNKNOWN"];
	const result = parseHeader(rawLines);
	assert(!result.ok);
});

Deno.test("Scrobbler Codec: parseTrack() parses valid track line", () => {
	const line = serializeTrack(MOCK_TRACK);
	const result = parseTrack(line);
	assert(result.ok);
	assertEquals(result.value.artist, "Yui Horie");
	assertEquals(result.value.duration, 307);
	assertEquals(result.value.musicBrainzId, "6a0a572c-a96a-4cff-8c9d-f132b0d2b9e9");
});

Deno.test("Scrobbler Codec: parseTrack() fails on invalid MusicBrainz ID", () => {
	const line = "A\t\tT\t\t240\tL\t1000\tinvalid-uuid";
	const result = parseTrack(line);
	assert(!result.ok);
	assertEquals(result.error.tag, "invalid_field");
});

Deno.test("Scrobbler Codec: parseTrack() fails on incorrect field count", () => {
	const line = "A\t\tT\t240\tL";
	const result = parseTrack(line);
	assert(!result.ok);
	assertEquals(result.error.tag, "invalid_columns");
});

Deno.test("Scrobbler Codec: parseTrack() fails on invalid rating", () => {
	const line = "A\t\tT\t\t240\tX\t1000\t";
	const result = parseTrack(line);
	assert(!result.ok);
	assertEquals(result.error.tag, "invalid_field");
});
