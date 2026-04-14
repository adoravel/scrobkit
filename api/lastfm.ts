import { crypto } from "@std/crypto";
import { AuthError, Errors, type LastFmError, type NetworkError } from "~/lib/errors.ts";
import { Fail, Ok, Result as $Result } from "~/lib/result.ts";
import { withRetryR } from "~/utils/retry.ts";

type Result<T> = $Result<T, LastFmError | AuthError | NetworkError>;

const BASE_URL = "https://ws.audioscrobbler.com/2.0/";
const USER_AGENT = "kyu.re/~scrobkit:v0.1.0";

interface RawSession {
	session: { key: string; name: string; subscriber: number };
}

interface RawScrobbleResponse {
	scrobbles: {
		"@attr": {
			accepted: number;
			ignored: number;
		};
	};
}

interface RawTrack {
	artist: { "#text": string };
	album: { "#text": string };
	name: string;
	date?: { "#text": string; uts: string };
	"@attr"?: { nowplaying: string };
}

interface RawRecentTracks {
	recenttracks: {
		track: RawTrack[];
		"@attr": { user: string; totalPages: string; page: string; total: string };
	};
}

export interface Session {
	key: string;
	name: string;
}

export type ScrobbleResult = RawScrobbleResponse["scrobbles"]["@attr"];

export interface RecentTrack {
	artist: string;
	album: string;
	title: string;
	date?: string;
	timestamp?: number;
	nowPlaying: boolean;
}

export interface RecentTracksPage {
	tracks: RecentTrack[];
	page: number;
	totalPages: number;
	totalTracks: number;
	user: string;
}

export interface ScrobblePayload {
	artist: string;
	album?: string;
	title: string;
	timestamp: number;
}

async function md5(input: string): Promise<string> {
	const hash = await crypto.subtle.digest(
		"MD5",
		new TextEncoder().encode(input),
	);
	return Array.from(new Uint8Array(hash))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

function asciiSort(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

async function fm<T>(
	params: Record<string, string | number>,
	secret?: string,
	method: "GET" | "POST" = "GET",
): Promise<Result<T>> {
	const body: Record<string, string> = {};

	for (const [k, v] of Object.entries(params)) {
		body[k] = String(v);
	}

	if (secret) {
		const toSign = Object.entries(body)
			.sort(([a], [b]) => asciiSort(a, b))
			.map(([k, v]) => `${k}${v}`)
			.join("");
		body.api_sig = await md5(toSign + secret);
		method = "POST";
	}

	const url = new URL(BASE_URL);
	const init: RequestInit = {
		headers: {
			"User-Agent": USER_AGENT,
		},
	};

	body.format = "json";
	if (method === "POST") {
		init.method = "POST";
		init.body = new URLSearchParams(body).toString();
	} else {
		(init.headers as any)["Content-Type"] = "application/x-www-form-urlencoded";

		for (const [k, v] of Object.entries(body)) {
			url.searchParams.set(k, v);
		}
	}

	let response: Response;
	try {
		response = await fetch(url, init);
	} catch (e) {
		return Fail(Errors.network(e instanceof Error ? e.message : String(e)));
	}

	if (!response.ok) {
		if (response.status === 429) {
			return Fail(Errors.lastfm(29, "Rate limit exceeded"));
		}
		return Fail(Errors.network(`HTTP ${response.status}`, response.status));
	}

	let json: any;
	try {
		json = await response.json();
	} catch {
		return Fail(Errors.network("Invalid JSON response"));
	}

	if (typeof json.error === "number") {
		return Fail(
			Errors.lastfm(
				json.error as LastFmError["tag"],
				typeof json.message === "string" ? json.message : "Unknown error",
			),
		);
	}

	return Ok(json);
}

export async function authenticate(
	apiKey: string,
	secret: string,
	username: string,
	password: string,
): Promise<Result<Session>> {
	const result = await fm<RawSession>(
		{ method: "auth.getMobileSession", api_key: apiKey, username, password },
		secret,
	);

	if (!result.ok) return result;
	return Ok({ key: result.value.session.key, name: result.value.session.name });
}

export async function scrobble(
	apiKey: string,
	secret: string,
	sessionKey: string,
	tracks: ScrobblePayload | ScrobblePayload[],
): Promise<Result<ScrobbleResult>> {
	const body: Record<string, string | number> = {
		method: "track.scrobble",
		api_key: apiKey,
		sk: sessionKey,
	};

	const inputs = Array.isArray(tracks) ? tracks : [tracks];
	if (inputs.length > 50) {
		return Fail(Errors.lastfm(8, "tracks.length must be <=50"));
	}

	inputs.forEach((s, i) => {
		const suffix = inputs.length > 1 ? `[${i}]` : "";

		body[`artist${suffix}`] = s.artist;
		body[`track${suffix}`] = s.title;
		body[`timestamp${suffix}`] = s.timestamp;
		if (s.album) {
			body[`album${suffix}`] = s.album;
		}
	});

	const result = await fm<RawScrobbleResponse>(body, secret);
	if (!result.ok) return result;

	const attr = result.value.scrobbles["@attr"];
	return Ok({
		accepted: Number(attr.accepted),
		ignored: Number(attr.ignored),
	});
}

export async function getRecentTracks(
	apiKey: string,
	username: string,
	page: number,
	options: { limit?: number; from?: number; to?: number } = {},
): Promise<Result<RecentTracksPage>> {
	const params: Record<string, string | number> = {
		method: "user.getRecentTracks",
		api_key: apiKey,
		user: username,
		page,
		limit: options.limit ?? 200,
	};

	if (options.from !== undefined) params.from = options.from;
	if (options.to !== undefined) params.to = options.to;

	const result = await fm<RawRecentTracks>(params);
	if (!result.ok) return result;

	const raw = result.value.recenttracks;
	const rawTracks = Array.isArray(raw.track) ? raw.track : [raw.track];

	const tracks: RecentTrack[] = rawTracks
		.filter((t) => t.date || t["@attr"]?.nowplaying === "true")
		.map((t) => ({
			artist: t.artist["#text"],
			album: t.album["#text"],
			title: t.name,
			date: t.date?.["#text"],
			timestamp: t.date?.uts ? Number(t.date.uts) : undefined,
			nowPlaying: t["@attr"]?.nowplaying === "true",
		}));

	return Ok({
		tracks,
		page: Number(raw["@attr"].page),
		totalPages: Number(raw["@attr"].totalPages),
		totalTracks: Number(raw["@attr"].total),
		user: raw["@attr"].user,
	});
}

export async function countScrobblesInRange(
	apiKey: string,
	username: string,
	from: number,
	to: number,
): Promise<Result<number>> {
	if (from > to) {
		return Fail(Errors.lastfm(8, "Invalid range: 'from' must be <= 'to'"));
	}

	// fetch a single track since we only care about the total attribute
	const result = await getRecentTracks(apiKey, username, 1, { limit: 1, from, to });
	if (!result.ok) return result;
	return Ok(result.value.totalTracks);
}

export async function verifySession(
	apiKey: string,
	secret: string,
	sessionKey: string,
): Promise<Result<void>> {
	const result = await fm(
		{ method: "user.getInfo", api_key: apiKey, sk: sessionKey },
		secret,
	);

	if (!result.ok) {
		if (result.error.kind === "lastfm" && result.error.tag === 9) {
			return Fail(Errors.auth("Session key is invalid or expired"));
		}
		return result;
	}

	return Ok(undefined);
}

export interface FetchAllOptions {
	readonly limit?: number;
	readonly from?: number;
	readonly to?: number;
}

export async function* getAllRecentTracks(
	apiKey: string,
	username: string,
	options: FetchAllOptions = {},
): AsyncGenerator<RecentTrack[], void, unknown> {
	const limit = options.limit ?? 200;
	let page = 1, totalPages = 1;

	while (page <= totalPages) {
		const result = await withRetryR(() => getRecentTracks(apiKey, username, page, { ...options, limit }));

		totalPages = result.totalPages;
		yield result.tracks;
		page = result.page + 1;
	}
}
