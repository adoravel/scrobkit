import { authenticate, verifySession } from "~/api/lastfm.ts";
import { type Config, updateConfig } from "~/lib/config.ts";
import { AppError } from "~/lib/errors.ts";
import { log } from "~/cli/formatter.ts";
import { ask } from "~/utils/prompt.ts";
import { Ok, Result } from "~/lib/result.ts";
import { SECRET_WARNING } from "~/cli/bootstrap.ts";

type SessionConfig = Omit<Required<Config>, "password">;

export async function ensureSession(config: Config): Promise<Result<SessionConfig, AppError>> {
	if (config.apiKey && config.secret && config.sessionKey && config.username) {
		const check = await verifySession(config.apiKey, config.secret, config.sessionKey);
		if (check.ok) {
			return Ok(config as SessionConfig);
		}
		log.warn("Session key is invalid or expired. Re-authenticating...");
	}

	const username = ask("  What's your Last.fm username? ");
	const password = ask(SECRET_WARNING + "\n\n  What about your account password? ", true);

	log.info("Authenticating...");
	const auth = await authenticate(config.apiKey, config.secret, username, password);

	if (!auth.ok) {
		return auth;
	}

	const updated = await updateConfig({
		username: auth.value.name,
		sessionKey: auth.value.key,
		password: undefined,
	});

	if (!updated.ok) {
		return updated;
	}

	log.success(`Authenticated as ${auth.value.name}`);
	return Ok(updated.value as SessionConfig);
}
