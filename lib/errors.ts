import { ScrobblerLogError, ScrobblerLogErrorReason } from "~/lib/format/scrobbler-log/error.ts";

export type AppError =
	| LastFmError
	| MusicBrainzError
	| ConfigError
	| CsvError
	| AuthError
	| RateLimitError
	| NetworkError
	| ScrobblerLogError;

export type LastFmErrorCode =
	| 2 // unavailable service
	| 3 // invalid method
	| 4 // authentication failed
	| 6 // invalid response format
	| 7 // invalid resource
	| 8 // generic error
	| 9 // invalid session key
	| 10 // invalid api key
	| 11 // service offline
	| 13 // invalid method signature
	| 16 // temporary error
	| 26 // suspended api key
	| 29; // rate limit exceeded

export interface BaseError<Kind> {
	readonly kind: Kind;
}

export interface TaggedError<Kind, Code> extends BaseError<Kind> {
	readonly tag: Code;
}

export interface LastFmError extends TaggedError<"lastfm", LastFmErrorCode> {
	readonly message: string;
}

export interface MusicBrainzError extends TaggedError<"musicbrainz", number> {
	readonly message: string;
}

type IOError = "not_found" | "parse_failed" | "write_failed";

export type ConfigErrorReason =
	| IOError
	| "permission_denied";

export interface ConfigError extends TaggedError<"config", ConfigErrorReason> {
	readonly message: string;
}

export type CsvErrorReason =
	| IOError
	| "invalid_columns";

export interface CsvError extends TaggedError<"csv", CsvErrorReason> {
	readonly message: string;
	readonly path: string;
}

export interface AuthError extends BaseError<"auth"> {
	readonly message: string;
}

export interface RateLimitError extends BaseError<"rate_limit"> {
	readonly retryAfterMs?: number;
}

export interface NetworkError extends TaggedError<"network", number | undefined> {
	readonly message: string;
}

export const Errors = {
	lastfm: (tag: LastFmErrorCode, message: string): LastFmError => ({ kind: "lastfm", tag, message }),

	musicbrainz: (tag: number, message: string): MusicBrainzError => ({ kind: "musicbrainz", tag, message }),

	config: (tag: ConfigErrorReason, message: string): ConfigError => ({ kind: "config", tag, message }),

	csv: (tag: CsvErrorReason, message: string, path: string): CsvError => ({ kind: "csv", tag, message, path }),

	auth: (message: string): AuthError => ({ kind: "auth", message }),

	rateLimit: (retryAfterMs?: number): RateLimitError => ({ kind: "rate_limit", retryAfterMs }),

	network: (message: string, status?: number): NetworkError => ({ kind: "network", message, tag: status }),

	scrobblerLog: (tag: ScrobblerLogErrorReason, message: string): ScrobblerLogError => ({
		kind: "scrobbler_log",
		tag,
		message,
	}),
} as const;

export function describe(e: AppError): string {
	switch (e.kind) {
		case "lastfm":
			return `Last.fm error ${e.tag}: ${e.message}`;
		case "musicbrainz":
			return `MusicBrainz error ${e.tag}: ${e.message}`;
		case "config":
			return `Config error (${e.tag}): ${e.message}`;
		case "csv":
			return `CSV error (${e.tag}) at ${e.path}: ${e.message}`;
		case "auth":
			return `Auth error: ${e.message}`;
		case "rate_limit":
			return e.retryAfterMs ? `Rate limited. Retry after ${e.retryAfterMs}ms` : "Rate limited";
		case "network":
			return e.tag ? `Network error ${e.tag}: ${e.message}` : `Network error: ${e.message}`;
		case "scrobbler_log":
			return `Scrobbler Log error (${e.tag}): ${e.message}`;
	}
}
