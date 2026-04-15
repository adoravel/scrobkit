import { assertEquals } from "jsr:@std/assert@1.0.16";
import { normaliseArtistMetadata } from "~/api/lotus.ts";

Deno.test("Lotus: Multi-artist truncation", () => {
	const result = normaliseArtistMetadata("21 savage & Metro Boomin");
	assertEquals(result, "21 savage");
});

Deno.test("Lotus: Combined artist false-positives", () => {
	const result = normaliseArtistMetadata("Joey Valence & Brae");
	assertEquals(result, "Joey Valence & Brae");
});

Deno.test("Lotus: The 'Tyler, The' exception", () => {
	const result = normaliseArtistMetadata("Tyler, The Creator");
	assertEquals(result, "Tyler, The Creator");
});

Deno.test("Lotus: Romanisation override", () => {
	const result = normaliseArtistMetadata("かめりあ");
	assertEquals(result, "Camellia");
});

Deno.test("Lotus: Separator cleanup", () => {
	const result = normaliseArtistMetadata("billie Eilish,  Future");
	assertEquals(result, "Billie Eilish");
});

Deno.test("Lotus: 'of bts' suffix logic", () => {
	const result = normaliseArtistMetadata("V of BTS");
	assertEquals(result, "V");
});
