import { assert } from "jsr:@std/assert@1.0.19";
import { authenticate, countScrobblesInRange, getRecentTracks, scrobble, verifySession } from "~/api/lastfm.ts";

function env(name: string): string {
	const v = Deno.env.get(name);
	if (!v) throw new Error(`missing env var: ${name}`);
	return v;
}

let cachedSessionKey: string | null = null;

const apiKey = env("LASTFM_API_KEY");
const secret = env("LASTFM_SECRET");
const username = env("LASTFM_USERNAME");

export async function getSessionKey(): Promise<string> {
	if (cachedSessionKey) return cachedSessionKey;

	const existing = Deno.env.get("LASTFM_SESSION_KEY");
	if (existing) {
		return cachedSessionKey = existing;
	}

	const password = env("LASTFM_PASSWORD");

	if (!apiKey || !secret || !username || !password) {
		throw new Error(
			"missing both LASTFM_SESSION_KEY and auth env vars",
		);
	}

	const res = await authenticate(apiKey, secret, username, password);
	if (!res.ok) {
		throw new Error("auth failed: " + JSON.stringify(res.error));
	}

	return cachedSessionKey = res.value.key;
}

function now() {
	return Math.floor(Date.now() / 1000);
}

Deno.test("verifySession (integration)", async () => {
	const sk = await getSessionKey();
	const res = await verifySession(apiKey, secret, sk);

	if (!res.ok) {
		throw new Error(JSON.stringify(res.error));
	}
	assert(res.ok);
});

Deno.test("getRecentTracks (integration)", async () => {
	const res = await getRecentTracks(apiKey, username, 1, { limit: 5 });

	if (!res.ok) {
		throw new Error(JSON.stringify(res.error));
	}

	assert(res.ok);

	assert(Array.isArray(res.value.tracks));
	assert(res.value.page >= 1);
	assert(res.value.totalPages >= 1);

	if (res.value.tracks.length > 0) {
		const t = res.value.tracks[0];
		assert(typeof t.artist === "string");
		assert(typeof t.title === "string");
	}
});

Deno.test("countScrobblesInRange (integration)", async () => {
	const to = now();
	const from = to - 86400 * 7; // last 7 days

	const res = await countScrobblesInRange(apiKey, username, from, to);

	if (!res.ok) {
		throw new Error(JSON.stringify(res.error));
	}
	assert(res.ok);

	// sanity bounds
	console.log("scrobbles in range:", res.value);
	assert(res.value >= 0);
	assert(res.value < 10_000_000);
});

Deno.test("scrobble (integration single)", async () => {
	const sk = await getSessionKey();

	const res = await scrobble(apiKey, secret, sk, {
		artist: "away with words",
		album: "What to Think About Again",
		title: "Grave Robbery",
		timestamp: now(),
	});

	if (!res.ok) {
		throw new Error(JSON.stringify(res.error));
	}

	assert(res.ok);
	assert(res.value.accepted === 1);
	assert(res.value.ignored === 0);
});

Deno.test("scrobble (integration batch)", async () => {
	const sk = await getSessionKey();

	const timestamp = now();

	const res = await scrobble(apiKey, secret, sk, [
		{
			artist: "key vs. locket",
			title: "coincidência",
			timestamp,
		},
		{
			artist: "Camellia",
			title: "fiиorza",
			timestamp: timestamp + 1,
		},
	]);

	if (!res.ok) {
		throw new Error(JSON.stringify(res.error));
	}

	assert(res.ok);

	assert(res.value.accepted === 2);
	assert(res.value.ignored === 0);
});
