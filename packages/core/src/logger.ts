const LOG_PREFIX = "[plasma]";

type LogLevel = "debug" | "info" | "warn" | "error";

type LogMethod = (message: string, ...details: unknown[]) => void;

const resolveConsole = (): Console | null => {
	if (typeof globalThis === "undefined") {
		return null;
	}

	return globalThis.console ?? null;
};

const createLoggerMethod =
	(level: LogLevel): LogMethod =>
	(message, ...details) => {
		const target = resolveConsole();
		if (!target) {
			return;
		}

		const consoleMethod = (target[level] ?? target.log)?.bind(target);
		consoleMethod?.(LOG_PREFIX, message, ...details);
	};

export const logger = {
	debug: createLoggerMethod("debug"),
	info: createLoggerMethod("info"),
	warn: createLoggerMethod("warn"),
	error: createLoggerMethod("error"),
};
