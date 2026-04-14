import { TaggedError } from "~/lib/errors.ts";

export type ScrobblerLogErrorReason =
	| "not_found"
	| "read_failed"
	| "write_failed"
	| "parse_failed"
	| "invalid_columns"
	| "invalid_field"
	| "unsupported_version";

export interface ScrobblerLogError extends TaggedError<"scrobbler_log", ScrobblerLogErrorReason> {
	readonly message: string;
}
