import type { RecentTrack } from "~/api/lastfm.ts";

export interface TrackFilters {
	readonly from?: number; // unix timestamp
	readonly to?: number; // unix timestamp
	readonly artist?: string;
	readonly album?: string;
}

export function matchesFilters(track: RecentTrack, filters: TrackFilters): boolean {
	if (filters.from !== undefined && (track.timestamp ?? 0) < filters.from) return false;
	if (filters.to !== undefined && (track.timestamp ?? 0) > filters.to) return false;
	if (filters.artist && !track.artist.toLowerCase().includes(filters.artist.toLowerCase())) return false;
	if (filters.album && !track.album.toLowerCase().includes(filters.album.toLowerCase())) return false;
	return true;
}
