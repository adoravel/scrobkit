import { Fail, Ok, Result } from "~/lib/result.ts";
import { Errors, NetworkError } from "~/lib/errors.ts";
import { BrowserSession } from "~/browser/session.ts";

const USER_AGENT =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36";

export interface DeleteScrobblePayload {
	artist: string;
	track: string;
	timestamp: number; // UNIX timestamp
}

async function performBrowserRequest(
	session: BrowserSession,
	endpoint: string,
	params: Record<string, string>,
): Promise<Result<void, NetworkError>> {
	const url = `https://www.last.fm/user/${session.username}${endpoint}`;

	const body = new URLSearchParams({
		...params,
		csrfmiddlewaretoken: session.csrfMiddlewareToken,
	});

	try {
		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Referer": `https://www.last.fm/user/${session.username}`,
				"User-Agent": USER_AGENT,
				"Cookie": `sessionid=${session.sessionId}; csrftoken=${session.csrfToken}`,
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: body.toString(),
		});

		if (!response.ok) {
			return Fail(
				Errors.network(
					`last.fm browser api returned http ${response.status}: ${await response.text()}`,
					response.status,
				),
			);
		}

		return Ok(undefined);
	} catch (e) {
		return Fail(Errors.network(e instanceof Error ? e.message : String(e)));
	}
}

/**
 * Deletes a scrobble via the Last.fm web UI endpoint, given that the official API doesn't provide you
 * measures to purge scrobbles.
 */
export async function deleteScrobble(
	session: BrowserSession,
	{ artist, track, timestamp }: DeleteScrobblePayload,
): Promise<Result<void, NetworkError>> {
	return await performBrowserRequest(session, "/library/delete", {
		artist_name: artist,
		track_name: track,
		timestamp: String(timestamp),
	});
}
