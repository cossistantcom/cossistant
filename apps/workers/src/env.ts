const getEnvVariable = (name: string, defaultValue?: string): string => {
	const value = process.env[name];

	if (value == null) {
		if (defaultValue == null) {
			// During build time in Vercel, some env vars might not be available
			if (process.env.VERCEL || process.env.BUILDING_FOR_VERCEL) {
				console.warn(
					`Warning: Environment variable ${name} not found during build, using placeholder`
				);
				return "build-time-placeholder";
			}

			console.warn(
				`WARNING: Environment variable ${name} not found during build`
			);

			return "";
		}
		return defaultValue;
	}

	return value;
};

const defaultBullBoardEnabled =
	process.env.NODE_ENV === "production" ? "false" : "true";
const defaultConversationLogCaptureEnabled =
	process.env.NODE_ENV === "development" ? "true" : "false";

export const env = {
	NODE_ENV: getEnvVariable("NODE_ENV"),
	PORT: +getEnvVariable("PORT", "8790"),
	REDIS_URL: getEnvVariable("REDIS_URL"),
	PUBLIC_APP_URL: getEnvVariable("PUBLIC_APP_URL", "https://cossistant.com"),
	AI_AGENT_CONCURRENCY: +getEnvVariable("AI_AGENT_CONCURRENCY", "30"),
	WEB_CRAWL_GLOBAL_ACTIVE_LIMIT: +getEnvVariable(
		"WEB_CRAWL_GLOBAL_ACTIVE_LIMIT",
		"3"
	),
	WEB_CRAWL_MAX_CONCURRENCY_PER_CRAWL: +getEnvVariable(
		"WEB_CRAWL_MAX_CONCURRENCY_PER_CRAWL",
		"15"
	),
	WEB_CRAWL_SLOT_TTL_MS: +getEnvVariable("WEB_CRAWL_SLOT_TTL_MS", "2100000"),
	WEB_CRAWL_BUDGET_REQUEUE_DELAY_MS: +getEnvVariable(
		"WEB_CRAWL_BUDGET_REQUEUE_DELAY_MS",
		"15000"
	),
	WEB_CRAWL_BUDGET_REQUEUE_JITTER_MS: +getEnvVariable(
		"WEB_CRAWL_BUDGET_REQUEUE_JITTER_MS",
		"5000"
	),
	AI_AGENT_CONVERSATION_LOG_CAPTURE_ENABLED:
		getEnvVariable(
			"AI_AGENT_CONVERSATION_LOG_CAPTURE_ENABLED",
			defaultConversationLogCaptureEnabled
		) === "true",
	AI_AGENT_CONVERSATION_LOG_FLUSH_INTERVAL_MS: +getEnvVariable(
		"AI_AGENT_CONVERSATION_LOG_FLUSH_INTERVAL_MS",
		"200"
	),
	// Database (needed for notification queries)
	DATABASE_HOST: getEnvVariable("DATABASE_HOST"),
	DATABASE_PORT: +getEnvVariable("DATABASE_PORT"),
	DATABASE_USERNAME: getEnvVariable("DATABASE_USERNAME"),
	DATABASE_PASSWORD: getEnvVariable("DATABASE_PASSWORD"),
	DATABASE_NAME: getEnvVariable("DATABASE_NAME"),
	BULL_BOARD_ENABLED:
		getEnvVariable("WORKERS_ENABLE_BULL_BOARD", defaultBullBoardEnabled) ===
		"true",
	BULL_BOARD_TOKEN: getEnvVariable("WORKERS_BULL_BOARD_TOKEN", ""),
	// Firecrawl API key for web crawling
	FIRECRAWL_API_KEY: getEnvVariable("FIRECRAWL_API_KEY", ""),
};
