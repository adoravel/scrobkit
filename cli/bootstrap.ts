import { type Config, loadConfig, updateConfig } from "~/lib/config.ts";
import { dim, log } from "~/cli/formatter.ts";
import { AppError } from "~/lib/errors.ts";
import { Ok, Result } from "~/lib/result.ts";
import { ask } from "~/utils/prompt.ts";
import { italic } from "@std/fmt/colors";

type BootstrapConfig = Omit<Required<Config>, "password" | "username">;

export const SECRET_WARNING = italic(dim(
	"\n\nYour Last.fm credentials are used only to authenticate with Last.fm services. " +
		"They are sent directly to Last.fm over a secure connection and are not stored locally after authentication.\n\n",
));

export async function requireBaseConfig(): Promise<Result<BootstrapConfig, AppError>> {
	const result = await loadConfig();

	if (result.ok && result.value.apiKey && result.value.secret) {
		return Ok(result.value as BootstrapConfig);
	}

	if (!result.ok && result.error.tag !== "not_found") {
		return result;
	}

	log.warn("No API credentials found. Let's set up scrobkit :3\n");

	const apiKey = ask("  What is your Last.fm API key?");
	console.log(SECRET_WARNING);
	const sharedSecret = ask("  What about your key's shared secret, eh?", true);

	const saved = await updateConfig({ apiKey, secret: sharedSecret });
	if (!saved.ok) {
		return saved;
	}

	return Ok(saved.value as BootstrapConfig);
}
