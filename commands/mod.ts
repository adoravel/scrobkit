import { Result } from "~/lib/result.ts";
import { AppError, describe } from "~/lib/errors.ts";
import { executeImportCommand } from "~/commands/import.ts";
import { parseArgs } from "@std/cli";
import { log } from "~/cli/formatter.ts";
import { dim } from "@std/fmt/colors";

const HELP_TEXT = `
scrobkit - A minimal CLI toolkit for working with Last.fm scrobbles

Usage: scrobkit <command> [options]

Commands:
  import     Import scrobbles from a CSV document

Run 'scrobkit <command> --help' for more information on a specific command.
`;

type CommandFn = (args: string[]) => Promise<Result<void, AppError>>;

const commands: Record<string, CommandFn> = {
	import: executeImportCommand,
};

async function main($: string[] = Deno.args) {
	const globalFlags = parseArgs($, {
		boolean: ["help"],
		alias: { h: "help" },
		stopEarly: true,
	});

	if (globalFlags.help || !globalFlags._?.toString()?.trim()) {
		console.log(HELP_TEXT);
		Deno.exit(0);
	}

	const commandName = globalFlags._[0];
	const commandFn = commands[commandName];

	if (!commandFn) {
		log.error(`Unknown command: '${commandName}'`);
		log.error(`Run 'scrobkit --help' to see available commands.`);
		Deno.exit(1);
	}

	const args = globalFlags._.slice(1) as string[];
	try {
		const result = await commandFn(args);
		if (!result.ok) {
			log.error(`Failed with tag ${dim(`'${result.error.kind}'`)}: ${dim(describe(result.error))}`);
			Deno.exit(1);
		}
	} catch (e) {
		if ((e as Error).message.includes("Required:")) {
			Deno.exit(1);
		}
	}
}

export const commandLineInterface = {
	commands,
	main,
};
