import { brightRed, cyan, dim, gray, green, red, yellow } from "@std/fmt/colors";

export const symbols = {
	retry: gray("\u21bb"),
	warn: cyan("\u26a0"),
	success: green("\u2714"),
	forbid: red("\u2298"),
	error: brightRed("\u2716"),
	info: yellow("\u{1f6c8} "),
} as const;

export const log = {
	success: (msg: string) => console.log(`  ${symbols.success} ${msg}`),

	error: (msg: string) => console.error(`  ${symbols.error} ${red(msg)}`),

	warn: (msg: string) => console.warn(`  ${symbols.warn} ${msg}`),

	info: (msg: string) => console.warn(`  ${symbols.info} ${msg}`),

	forbid: (msg: string) => console.log(`  ${symbols.forbid} ${cyan(msg)}`),
};

export { dim };
