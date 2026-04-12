import { promptSecret } from "@std/cli";

export function ask(message: string, secret = false, transform: (input: string) => string = (x) => x.trim()): string {
	const value = transform(
		(secret ? promptSecret : prompt)(message + " ") ?? "",
	);

	if (!value) {
		throw new Error(`Required: ${message}`);
	}
	return value;
}

export function askOptional(message: string): string | null {
	const value = prompt(message);
	return value?.trim() || null;
}

export function confirm(message: string, defaultYes = false): boolean {
	const hint = defaultYes ? "[Y/n]" : "[y/N]";
	const value = prompt(`${message} ${hint} `)?.trim().toLowerCase();
	if (!value) return defaultYes;
	return value === "y" || value === "yes" || value === "si" || value === "sí" || value === "sim" || value === "ja";
}

export function choose<T>(
	message: string,
	items: T[],
	label: (item: T) => string,
): T {
	console.log(`\n${message}`);
	items.forEach((item, i) => console.log(`  ${i + 1}. ${label(item)}`));

	while (true) {
		const raw = prompt(`\nEnter number (1-${items.length}):`);
		const n = parseInt(raw ?? "", 10);
		if (n >= 1 && n <= items.length) return items[n - 1];
		console.log(`  Please enter a number between 1 and ${items.length}.`);
	}
}
