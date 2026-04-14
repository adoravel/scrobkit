import { cyan, dim, gray, green, red } from "@std/fmt/colors";

export const symbols = {
	retry: gray("\u21bb"),
	warn: cyan("\u26a0"),
	success: green("\u2714"),
	forbid: red("\u2298"),
	error: red("\u2716"),
} as const;

export { dim };
