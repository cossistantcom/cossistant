import type { MarkdownToken } from "@plasma/tiny-markdown";

export const COMMAND_PREFERENCE_STORAGE_KEY = "plasma:package-manager";
export const COMMAND_PREFERENCE_EVENT = "plasma:package-manager-change";
export const DEFAULT_PACKAGE_MANAGER = "npm" as const;

export const COMMAND_PACKAGE_MANAGERS = ["npm", "yarn", "pnpm", "bun"] as const;

export type CommandPackageManager = (typeof COMMAND_PACKAGE_MANAGERS)[number];

export type CommandVariants = Record<CommandPackageManager, string>;

export function isCommandPackageManager(
	value: string
): value is CommandPackageManager {
	return (COMMAND_PACKAGE_MANAGERS as readonly string[]).includes(value);
}

type CommandIntent = "install" | "run" | "create" | "npx-create" | "exec";

type NormalizedCommand = {
	intent: CommandIntent;
	args: string;
};

export type StandaloneInlineCommand = {
	command: string;
	variants: CommandVariants;
};

export type InlineParagraphCommand = {
	command: string;
	variants: CommandVariants;
	index: number;
};

function normalizeInput(input: string): string | null {
	const normalized = input.replace(/\s+/g, " ").trim();
	if (!normalized || normalized.includes("\n") || normalized.includes("\r")) {
		return null;
	}

	return normalized;
}

function splitCommand(command: string): string[] {
	return command.split(/\s+/).filter(Boolean);
}

function joinArgs(tokens: string[]): string | null {
	if (tokens.length === 0) {
		return null;
	}

	const args = tokens.join(" ").trim();
	return args.length > 0 ? args : null;
}

function getNormalizedFromNpx(tokens: string[]): NormalizedCommand | null {
	const firstArg = tokens[1];
	if (!firstArg) {
		return null;
	}

	if (firstArg.startsWith("create-")) {
		const createdName = firstArg.slice("create-".length);
		if (!createdName) {
			return null;
		}

		const args = joinArgs([createdName, ...tokens.slice(2)]);
		if (!args) {
			return null;
		}

		return { intent: "npx-create", args };
	}

	const args = joinArgs(tokens.slice(1));
	if (!args) {
		return null;
	}

	return { intent: "exec", args };
}

function getNormalizedFromNpm(tokens: string[]): NormalizedCommand | null {
	const action = tokens[1];
	if (!action) {
		return null;
	}

	if (action === "install") {
		const args = joinArgs(tokens.slice(2));
		return args ? { intent: "install", args } : null;
	}

	if (action === "run") {
		const args = joinArgs(tokens.slice(2));
		return args ? { intent: "run", args } : null;
	}

	if (action === "create") {
		const args = joinArgs(tokens.slice(2));
		return args ? { intent: "create", args } : null;
	}

	return null;
}

function getNormalizedFromPnpm(tokens: string[]): NormalizedCommand | null {
	const action = tokens[1];
	if (!action) {
		return null;
	}

	if (action === "add") {
		const args = joinArgs(tokens.slice(2));
		return args ? { intent: "install", args } : null;
	}

	if (action === "run") {
		const args = joinArgs(tokens.slice(2));
		return args ? { intent: "run", args } : null;
	}

	if (action === "create") {
		const args = joinArgs(tokens.slice(2));
		return args ? { intent: "create", args } : null;
	}

	if (action === "dlx") {
		const args = joinArgs(tokens.slice(2));
		if (!args) {
			return null;
		}

		if (tokens[2]?.startsWith("create-")) {
			const createTarget = tokens[2].slice("create-".length);
			const createArgs = joinArgs([createTarget, ...tokens.slice(3)]);
			return createArgs ? { intent: "npx-create", args: createArgs } : null;
		}

		return { intent: "exec", args };
	}

	if (action.startsWith("-")) {
		return null;
	}

	const shorthandRunArgs = joinArgs(tokens.slice(1));
	return shorthandRunArgs ? { intent: "run", args: shorthandRunArgs } : null;
}

function getNormalizedFromYarn(tokens: string[]): NormalizedCommand | null {
	const action = tokens[1];
	if (!action) {
		return null;
	}

	if (action === "add") {
		const args = joinArgs(tokens.slice(2));
		return args ? { intent: "install", args } : null;
	}

	if (action === "run") {
		const args = joinArgs(tokens.slice(2));
		return args ? { intent: "run", args } : null;
	}

	if (action === "create") {
		const args = joinArgs(tokens.slice(2));
		return args ? { intent: "create", args } : null;
	}

	if (action === "dlx") {
		const args = joinArgs(tokens.slice(2));
		if (!args) {
			return null;
		}

		if (tokens[2]?.startsWith("create-")) {
			const createTarget = tokens[2].slice("create-".length);
			const createArgs = joinArgs([createTarget, ...tokens.slice(3)]);
			return createArgs ? { intent: "npx-create", args: createArgs } : null;
		}

		return { intent: "exec", args };
	}

	if (action.startsWith("-")) {
		return null;
	}

	const shorthandRunArgs = joinArgs(tokens.slice(1));
	return shorthandRunArgs ? { intent: "run", args: shorthandRunArgs } : null;
}

function getNormalizedFromBun(tokens: string[]): NormalizedCommand | null {
	const action = tokens[1];
	if (!action) {
		return null;
	}

	if (action === "add") {
		const args = joinArgs(tokens.slice(2));
		return args ? { intent: "install", args } : null;
	}

	if (action === "run") {
		const args = joinArgs(tokens.slice(2));
		return args ? { intent: "run", args } : null;
	}

	if (action === "create") {
		const args = joinArgs(tokens.slice(2));
		return args ? { intent: "create", args } : null;
	}

	if (action.startsWith("-")) {
		return null;
	}

	const shorthandRunArgs = joinArgs(tokens.slice(1));
	return shorthandRunArgs ? { intent: "run", args: shorthandRunArgs } : null;
}

function getNormalizedFromBunx(tokens: string[]): NormalizedCommand | null {
	let startIndex = 1;
	if (tokens[1] === "--bun") {
		startIndex = 2;
	}

	const firstArg = tokens[startIndex];
	if (!firstArg) {
		return null;
	}

	if (firstArg.startsWith("create-")) {
		const createTarget = firstArg.slice("create-".length);
		if (!createTarget) {
			return null;
		}

		const args = joinArgs([createTarget, ...tokens.slice(startIndex + 1)]);
		return args ? { intent: "npx-create", args } : null;
	}

	const args = joinArgs(tokens.slice(startIndex));
	return args ? { intent: "exec", args } : null;
}

function normalizeCommand(input: string): NormalizedCommand | null {
	const normalizedInput = normalizeInput(input);
	if (!normalizedInput) {
		return null;
	}

	const tokens = splitCommand(normalizedInput);
	const command = tokens[0];
	if (!command) {
		return null;
	}

	if (command === "npm") {
		return getNormalizedFromNpm(tokens);
	}

	if (command === "npx") {
		return getNormalizedFromNpx(tokens);
	}

	if (command === "pnpm") {
		return getNormalizedFromPnpm(tokens);
	}

	if (command === "yarn") {
		return getNormalizedFromYarn(tokens);
	}

	if (command === "bun") {
		return getNormalizedFromBun(tokens);
	}

	if (command === "bunx") {
		return getNormalizedFromBunx(tokens);
	}

	return null;
}

function toCommandVariants(command: NormalizedCommand): CommandVariants {
	switch (command.intent) {
		case "install":
			return {
				npm: `npm install ${command.args}`,
				yarn: `yarn add ${command.args}`,
				pnpm: `pnpm add ${command.args}`,
				bun: `bun add ${command.args}`,
			};
		case "run":
			return {
				npm: `npm run ${command.args}`,
				yarn: `yarn ${command.args}`,
				pnpm: `pnpm ${command.args}`,
				bun: `bun ${command.args}`,
			};
		case "create":
			return {
				npm: `npm create ${command.args}`,
				yarn: `yarn create ${command.args}`,
				pnpm: `pnpm create ${command.args}`,
				bun: `bun create ${command.args}`,
			};
		case "npx-create":
			return {
				npm: `npx create-${command.args}`,
				yarn: `yarn create ${command.args}`,
				pnpm: `pnpm create ${command.args}`,
				bun: `bunx --bun create-${command.args}`,
			};
		case "exec":
			return {
				npm: `npx ${command.args}`,
				yarn: `yarn ${command.args}`,
				pnpm: `pnpm dlx ${command.args}`,
				bun: `bunx --bun ${command.args}`,
			};
		default: {
			const exhaustiveCheck: never = command.intent;
			throw new Error(`Unhandled command intent: ${String(exhaustiveCheck)}`);
		}
	}
}

export function mapCommandVariants(input: string): CommandVariants | null {
	const normalizedCommand = normalizeCommand(input);
	if (!normalizedCommand) {
		return null;
	}

	return toCommandVariants(normalizedCommand);
}

export function mapStandaloneInlineCommandFromParagraphChildren(
	children: MarkdownToken[]
): StandaloneInlineCommand | null {
	let inlineCommand: string | null = null;

	for (const child of children) {
		if (child.type === "text" && child.content.trim().length === 0) {
			continue;
		}

		if (child.type === "code" && child.inline) {
			if (inlineCommand !== null) {
				return null;
			}

			inlineCommand = child.content;
			continue;
		}

		return null;
	}

	if (!inlineCommand) {
		return null;
	}

	const variants = mapCommandVariants(inlineCommand);
	if (!variants) {
		return null;
	}

	return {
		command: inlineCommand,
		variants,
	};
}

export function mapInlineCommandFromParagraphChildren(
	children: MarkdownToken[]
): InlineParagraphCommand | null {
	let inlineCommand: InlineParagraphCommand | null = null;

	for (const [index, child] of children.entries()) {
		if (child.type !== "code" || !child.inline) {
			continue;
		}

		const variants = mapCommandVariants(child.content);
		if (!variants) {
			continue;
		}

		if (inlineCommand) {
			return null;
		}

		inlineCommand = {
			command: child.content,
			variants,
			index,
		};
	}

	return inlineCommand;
}
