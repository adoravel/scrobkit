import { Config } from "~/lib/config.ts";
import { log } from "~/cli/formatter.ts";

export interface BrowserSession {
	username: string;
	sessionId: string;
	csrfToken: string;
	csrfMiddlewareToken: string;
	userAgent?: string;
}

let activeSession: BrowserSession | null = null;

/**
 * Prompts the user for session data if not already present in memory.
 */
export function ensureBrowserSession(config: Config): BrowserSession | null {
	if (activeSession) return activeSession;

	const username = config.username || prompt("Enter Last.fm username:");
	if (!username) return null;

	log.warn("Last.fm Browser Authentication Required");
	log.warn("These values are found in your browser cookies/inspector and will not be saved to disk.");

	const sessionId = prompt("Enter 'sessionid' (from cookies):")?.trim();
	const csrfToken = prompt("Enter 'csrftoken' (from cookies):")?.trim();
	const csrfMiddlewareToken = prompt("Enter 'csrfmiddlewaretoken' (from page source):")?.trim();

	if (!sessionId || !csrfToken || !csrfMiddlewareToken) {
		log.error("Authentication cancelled: Missing required session values.");
		return null;
	}

	activeSession = {
		username,
		sessionId,
		csrfToken,
		csrfMiddlewareToken,
	};
	return activeSession;
}
