import { appendTrack, createLog, deleteLog, readScrobblerLog } from "~/lib/format/scrobbler-log/io.ts";
import { ScrobblerLogHeader, ScrobblerLogTrack } from "~/lib/format/scrobbler-log/mod.ts";
import { assert, assertEquals } from "jsr:@std/assert@1.0.19";
import { join } from "@std/path";

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

Deno.test("scrobbler.log I/O: createLog() and readScrobblerLog() roundtrip", async (t) => {
	const tempDir = await Deno.makeTempDir();

	await t.step("create log writes file", async () => {
		const create = await createLog(tempDir, MOCK_HEADER, [MOCK_TRACK]);
		assert(create.ok);
	});

	await t.step("read log parses file correctly", async () => {
		const read = await readScrobblerLog(tempDir);
		assert(read.ok);
		assertEquals(read.value.tracks.length, 1);
		assertEquals(read.value.tracks[0].artist, "Yui Horie");
	});
});

Deno.test(".scrobbler.log I/O: readScrobblerLog() accepts direct file path", async () => {
	const tmp = await Deno.makeTempDir();
	const path = join(tmp, ".scrobbler.log");

	await createLog(tmp, MOCK_HEADER, [MOCK_TRACK]);

	const result = await readScrobblerLog(path);
	assert(result.ok);
	assertEquals(result.value.tracks.length, 1);
});

Deno.test(".scrobbler.log I/O: readScrobblerLog() returns not_found", async () => {
	const read = await readScrobblerLog("/tmp/missing_scrobbler_dir");
	assert(!read.ok);
	assertEquals(read.error.tag, "not_found");
});

Deno.test(".scrobbler.log I/O: appendTrack() creates file with header if missing", async (t) => {
	const tmp = await Deno.makeTempDir();

	await t.step("append to non-existent file", async () => {
		const append = await appendTrack(tmp, MOCK_HEADER, MOCK_TRACK);
		assert(append.ok);
	});

	await t.step("verify header was properly written", async () => {
		const read = await readScrobblerLog(tmp);
		assert(read.ok);
		assertEquals(read.value.header.version, "1.1");
		assertEquals(read.value.tracks.length, 1);
	});
});

Deno.test(".scrobbler.log I/O: appendTrack() appends without duplicating header", async () => {
	const tempDir = await Deno.makeTempDir();

	await createLog(tempDir, MOCK_HEADER, [MOCK_TRACK]);
	const append = await appendTrack(tempDir, MOCK_HEADER, { ...MOCK_TRACK, title: "Title 2" });
	assert(append.ok);

	const read = await readScrobblerLog(tempDir);
	assert(read.ok);

	assertEquals(read.value.tracks.length, 2);
	assertEquals(read.value.tracks[1].title, "Title 2");
});

Deno.test(".scrobbler I/O: deleteLog() removes file", async () => {
	const tempDir = await Deno.makeTempDir();
	await createLog(tempDir, MOCK_HEADER, [MOCK_TRACK]);

	const deletes = await deleteLog(tempDir);
	assert(deletes.ok);

	const read = await readScrobblerLog(tempDir);
	assert(!read.ok);
	assertEquals(read.error.tag, "not_found");
});

Deno.test(".scrobbler.log I/O: deleteLog() is idempotent (does not fail on missing file)", async () => {
	const tempDir = await Deno.makeTempDir();
	const deletes = await deleteLog(tempDir);
	assert(deletes.ok);
});
