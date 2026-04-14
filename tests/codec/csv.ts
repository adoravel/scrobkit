import { assert, assertEquals } from "jsr:@std/assert@1.0.19";
import { escape, parseTrack, serializeHeader, serializeTrack, split, unescape } from "~/lib/format/csv/codec.ts";
import { type DocumentTrack } from "~/lib/format/csv/mod.ts";

Deno.test("CSV Codec: split() handles unquoted fields", () => {
	assertEquals(split("a,b,c"), ["a", "b", "c"]);
});

Deno.test("CSV Codec: split() handles quoted fields with commas", () => {
	assertEquals(split('"a,b",c,d'), ["a,b", "c", "d"]);
});

Deno.test("CSV Codec: split() handles escaped quotes inside quotes", () => {
	assertEquals(split('"a""b",c'), ['a"b', "c"]);
});

Deno.test("CSV Codec: unescape() strips quotes and unescapes", () => {
	assertEquals(unescape('"hello""world"'), 'hello"world');
	assertEquals(unescape("unchanged"), "unchanged");
});

Deno.test("CSV Codec: escape() wraps and escapes when necessary", () => {
	assertEquals(escape("hello, world"), '"hello, world"');
	assertEquals(escape('say "meow"'), '"say ""meow"""');
	assertEquals(escape("unchanged"), "unchanged");
});

Deno.test("CSV Codec: serializeTrack() correctly formats a row", () => {
	const track: DocumentTrack = { artist: "A", album: "B", title: "C", date: "D" };
	assertEquals(serializeTrack(track), "A,B,C,D");
});

Deno.test("CSV Codec: serializeHeader() matches expected format", () => {
	assertEquals(serializeHeader(), "artist,album,title,date");
});

Deno.test("CSV Codec: parseTrack() successfully parses a valid line", () => {
	const result = parseTrack("Artist,Album,Title,2023-01-01", 0, "test.csv");
	assert(result.ok);
	assertEquals(result.value, { artist: "Artist", album: "Album", title: "Title", date: "2023-01-01" });
});

Deno.test("CSV Codec: parseTrack() fails on header row", () => {
	const result = parseTrack("artist,album,title,date", 0, "test.csv");
	assert(!result.ok);
	assertEquals(result.error.tag, "invalid_columns");
});

Deno.test("CSV Codec: parseTrack() fails if less than 3 columns", () => {
	const result = parseTrack("Artist", 0, "test.csv");
	assert(!result.ok);
	assertEquals(result.error.tag, "invalid_columns");
});
