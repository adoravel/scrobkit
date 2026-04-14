// https://web.archive.org/web/20170107015006/http://www.audioscrobbler.net/wiki/Portable_Player_Logging

/**
 * Semantic version identifier for the scrobbler log format.
 */
export type ScrobblerLogVersion = "1.0" | "1.1";

/**
 * Classify as "L" (scrobble) if the ratio of playback duration to total track duration is ≥ 50%;
 * otherwise, classify as "S" (skip).
 */
export type TrackRating = "L" | "S";

/**
 * If the device has a known time zone, it MUST normalize all recorded timestamps to UTC (e.g., #TZ/UTC).
 *
 * If the device has a valid clock but an unknown time zone, timestamps MUST be recorded as
 * local (unqualified) time (e.g., #TZ/UNKNOWN).
 */
export type Timezone =
	| { kind: "unknown" }
	| { kind: "utc" };

/**
 * Core domain representation of a scrobbled track.
 */
export interface ScrobblerLogTrack {
	readonly artist: string;
	readonly album?: string;
	readonly title: string;
	readonly trackIndex?: number;
	readonly duration: number;
	readonly rating: TrackRating;
	readonly timestamp: number;
	readonly musicBrainzId?: string;
}

/**
 * Strict client identification. Enforces format like "Rockbox h3xx 1.1"
 */
export interface ClientIdentification {
	readonly device: string;
	readonly model?: string;
	readonly revision: string;
}

/**
 * The header configuration required to initialize a log file.
 */
export interface ScrobblerLogHeader {
	readonly version: ScrobblerLogVersion;
	readonly timezone: Timezone;
	readonly client: ClientIdentification;
}
