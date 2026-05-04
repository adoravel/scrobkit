import { default as $romanisedArtists } from "~/third-party/lotus/romanised_artists.json" with { type: "json" };
import { default as artists } from "~/third-party/lotus/artist.json" with { type: "json" };
import { default as combinedArtists } from "~/third-party/lotus/combined_artists.json" with { type: "json" };

// overrides
const romanisedArtists: Record<string, string> = { ...$romanisedArtists };
romanisedArtists["かめりあ"] = "Camellia";
romanisedArtists["ななひら"] = "Nanahira";

function normalise(input: Record<string, string>): typeof lookup & ((key: string) => string) {
	const lookup = Object.fromEntries(
		Object.entries(input).map(([k, v]) => [k.toLowerCase(), v]),
	);
	const fn = (key: string) => lookup[key.toLowerCase()] ?? key;
	return Object.assign(fn, lookup);
}

const lotus = {
	normaliseArtist: normalise(artists),
	romanise: normalise(romanisedArtists),
};

export function normaliseArtistMetadata(rawArtist: string) {
	const removeUnwantedTokens = (raw: string | string[], regex: RegExp) => 
		typeof raw === 'string' ? raw.split(regex) : raw.join(" ").split(regex)
		.map((s) => s.trim())
		.filter(Boolean)
		.filter((s) => !s.match(regex))
	
	const featTokens = /\s(&|feat\.?|ft\.?)\s/i;
	const commaTokens = /(、|,\s)/i;

	const base = [featTokens, commaTokens].reduce((acc, regex) => {
		return acc.flatMap((s) => removeUnwantedTokens(s, regex));
	}, [rawArtist]);

	let artist = base.join(";");
	for (const [key, transform] of Object.entries(combinedArtists)) {
		if (artist.toLowerCase().includes(key.toLowerCase())) {
			const pattern = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
			artist = artist.replace(pattern, transform);
		}
	}

	const index = artist.indexOf(";");
	artist = index !== -1 ? artist.substring(0, index) : artist;

	return lotus.romanise(lotus.normaliseArtist(artist));
}
