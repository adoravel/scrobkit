export const SKIP_PREFIX = "#SKIP:";

export interface DocumentTrack {
	readonly artist: string;
	readonly album: string;
	readonly title: string;
	readonly date: string;
}

export const CSV_HEADER: readonly string[] = ["artist", "album", "title", "date"] as const;

/**
 * immutable state representing a loaded csv document in memory
 */
export interface CsvDocument {
	readonly path: string;
	readonly rawLines: readonly string[];
	readonly pending: ReadonlyArray<{ track: DocumentTrack; lineIndex: number }>;
	readonly skippedCount: number;
}
