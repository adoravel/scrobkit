import { join } from "@std/path";
import { Errors } from "../lib/errors.ts";
import { Fail, Ok, Result as $Result } from "~/lib/result.ts";

export interface Config {
	apiKey: string;
	secret: string;
	username?: string;
	sessionKey?: string;
	password?: string;
}

function getConfigDir(): string {
	const env = Deno.env;

	if (Deno.build.os === "windows") {
		const appData = env.get("APPDATA");
		if (appData) return appData;
	} else if (Deno.build.os === "darwin") {
		const home = env.get("HOME");
		if (home) return join(home, "Library", "Preferences");
	} else {
		const xdg = env.get("XDG_CONFIG_HOME");
		if (xdg) return xdg;

		const home = env.get("HOME");
		if (home) return join(home, ".config");
	}

	throw new Error("Unable to determine config directory (missing environment variables)");
}

const CONFIG_DIR = join(getConfigDir(), "scrobkit");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

type Result<T> = $Result<T, ReturnType<typeof Errors.config>>;

export async function loadConfig(): Promise<Result<Config>> {
	try {
		const raw = await Deno.readTextFile(CONFIG_PATH);
		const json = JSON.parse(raw);

		if (!isValidConfig(json)) {
			return Fail(Errors.config("parse_failed", "Config is missing required fields (apiKey, secret)"));
		}
		return Ok(json);
	} catch (e) {
		if (e instanceof Deno.errors.NotFound) {
			return Fail(Errors.config("not_found", `No config found at ${CONFIG_PATH}`));
		}
		if (e instanceof Deno.errors.PermissionDenied) {
			return Fail(Errors.config("permission_denied", `Lacking permissions to read ${CONFIG_PATH}`));
		}
		return Fail(Errors.config("parse_failed", e instanceof Error ? e.message : String(e)));
	}
}

export async function saveConfig(config: Config): Promise<Result<void>> {
	try {
		await Deno.mkdir(CONFIG_DIR, { recursive: true });
		await Deno.writeTextFile(CONFIG_PATH, JSON.stringify(config, null, "\t"));

		return Ok(undefined);
	} catch (e) {
		if (e instanceof Deno.errors.PermissionDenied) {
			return Fail(Errors.config("permission_denied", `Lacking permisssions to write to ${CONFIG_PATH}`));
		}
		return Fail(Errors.config("write_failed", e instanceof Error ? e.message : String(e)));
	}
}

export async function updateConfig(
	patch: Partial<Config>,
): Promise<Result<Config>> {
	const existing = await loadConfig();

	const base: Config = existing.ok ? existing.value : { apiKey: "", secret: "" };
	const merged = { ...base, ...patch };

	if (!isValidConfig(merged)) {
		return Fail(Errors.config("parse_failed", "Merged config is invalid"));
	}

	const saved = await saveConfig(merged);
	return saved.ok ? Ok(merged) : saved;
}

function isValidConfig(obj: unknown): obj is Config {
	return (
		typeof obj === "object" &&
		obj !== null &&
		typeof (obj as Record<string, unknown>).apiKey === "string" &&
		typeof (obj as Record<string, unknown>).secret === "string" &&
		(obj as Config).apiKey.length > 0 &&
		(obj as Config).secret.length > 0
	);
}

export { type Result as ConfigResult };
