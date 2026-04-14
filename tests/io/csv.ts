import { assert, assertEquals } from "jsr:@std/assert@1.0.19";
import { join } from "@std/path";
import { loadCsvDocument, markSkipped, saveCsvDocument } from "~/lib/format/csv/io.ts";
import { type DocumentTrack, SKIP_PREFIX } from "~/lib/format/csv/mod.ts";

Deno.test("CSV I/O: saveCsvDocument() and loadCsvDocument() roundtrip", async (t) => {
	const tempDir = await Deno.makeTempDir();
	const path = join(tempDir, "test.csv");

	const tracks: DocumentTrack[] = [
		{ artist: "A", album: "B", title: "C", date: "D" },
		{ artist: "E, F", album: "G", title: 'H "I"', date: "J" }, // Contains special chars
	];

	await t.step("save creates file", async () => {
		const result = await saveCsvDocument(path, tracks);
		assert(result.ok);
	});

	await t.step("load reads and parses correctly", async () => {
		const result = await loadCsvDocument(path);
		assert(result.ok);
		assertEquals(result.value.pending.length, 2);
		assertEquals(result.value.pending[1].track.artist, "E, F");
		assertEquals(result.value.pending[1].track.title, 'H "I"');
	});
});

Deno.test("CSV I/O: loadCsvDocument() returns not_found for missing file", async () => {
	const result = await loadCsvDocument("/tmp/definitely_does_not_exist_12345.csv");
	assert(!result.ok);
	assertEquals(result.error.tag, "not_found");
});

Deno.test("CSV I/O: markSkipped() updates line and saves", async (t) => {
	const tempDir = await Deno.makeTempDir();
	const path = join(tempDir, "skip.csv");
	const tracks = [{ artist: "A", album: "B", title: "C", date: "D" }];

	saveCsvDocument(path, tracks);
	const loadResult = await loadCsvDocument(path);
	assert(loadResult.ok);
	const doc = loadResult.value;

	await t.step("mark skipped returns updated doc", async () => {
		const markResult = await markSkipped(doc, 1);
		assert(markResult.ok);
		assertEquals(markResult.value.rawLines[1], `${SKIP_PREFIX}A,B,C,D`);
		assertEquals(markResult.value.skippedCount, 1);
	});

	await t.step("reloading picks up the skip", async () => {
		const reloadResult = await loadCsvDocument(path);
		assert(reloadResult.ok);
		assertEquals(reloadResult.value.skippedCount, 1);
		assertEquals(reloadResult.value.pending.length, 0);
	});
});

Deno.test("CSV I/O: markSkipped() is idempotent", async () => {
	const tempDir = await Deno.makeTempDir();
	const path = join(tempDir, "idem.csv");
	saveCsvDocument(path, [{ artist: "A", album: "B", title: "C", date: "D" }]);

	const doc = await loadCsvDocument(path);
	assert(doc.ok);

	const marked1 = await markSkipped(doc.value, 1);
	assert(marked1.ok);
	const marked2 = await markSkipped(marked1.value, 1);
	assert(marked2.ok);

	assert(!marked2.value.rawLines[1].startsWith(`${SKIP_PREFIX}${SKIP_PREFIX}`));
});
