import { parseArgs } from "@std/cli";
import { exists } from "@std/fs";
import { requireBaseConfig } from "~/cli/bootstrap.ts";
import { AppError, Errors } from "~/lib/errors.ts";
import { Fail, Ok, Result } from "~/lib/result.ts";
import { ensureSession } from "~/cli/session.ts";
import { runCsvPipeline } from "~/cli/csv-runner.ts";
import { runScrobblerLogPipeline } from "~/cli/scrobbler-log-runner.ts";
import { log } from "~/cli/formatter.ts";
import { PipelineOptions } from "~/cli/pipeline.ts";

const HELP_TEXT = `
Usage: scrobkit import [options...] <path>

Arguments:
  <path>              Path to either a .scrobbler.log or .csv file.

Options:
  -n, --dry-run       Simulate the import without scrobbling or modifying the file
  -h, --help          Show this help message
`;

export async function executeImportCommand(args: string[] = Deno.args): Promise<Result<void, AppError>> {
	const flags = parseArgs(args, {
		boolean: ["dry-run", "help"],
		alias: {
			n: "dry-run",
			h: "help",
		},
		default: {
			"dry-run": false,
		},
	});

	if (flags.help || !args.length || !flags._?.toString()?.trim()) {
		console.log(HELP_TEXT), Deno.exit(0);
	}

	const path = flags._.toString();

	if (!await exists(path)) {
		return Fail(Errors.config("not_found", `path \`${path}\` was not found`));
	}

	const config = await requireBaseConfig();
	if (!config.ok) return config;

	const session = await ensureSession(config.value);
	if (!session.ok) return session;

	const opts: PipelineOptions = {
		config: session.value,
		dryRun: flags["dry-run"],
	};

	try {
		const isCsv = path.endsWith(".csv");
		const isLog = path.endsWith(".scrobbler.log");
		if (!isCsv && !isLog) {
			return Fail(Errors.config("parse_failed", "can't parse an unsupported format"));
		}

		await (isCsv ? runCsvPipeline : runScrobblerLogPipeline)(path, opts as any);
	} catch (e) {
		log.error("Import failed unexpectedly.");
		if (e instanceof Error) log.error(e.message);
		Deno.exit(1);
	}

	return Ok(void 0);
}
