const getEnvVariable = (name: string, defaultValue?: string): string => {
	const value = process.env[name];

	if (value == null) {
		if (defaultValue == null) {
			// During build time in Vercel, some env vars might not be available
			// when building packages that don't actually need them
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

const defaultTracePayloadMode =
	process.env.NODE_ENV === "development" ? "raw" : "sanitized";

export const env = {
	NODE_ENV: getEnvVariable("NODE_ENV"),
	TINYBIRD_HOST: getEnvVariable("TINYBIRD_HOST", "http://localhost:7181"),
	TINYBIRD_TOKEN: getEnvVariable("TINYBIRD_TOKEN", "admin"),
	TINYBIRD_SIGNING_KEY: getEnvVariable("TINYBIRD_SIGNING_KEY", ""),
	TINYBIRD_WORKSPACE: getEnvVariable("TINYBIRD_WORKSPACE", ""),
	DATABASE_HOST: getEnvVariable("DATABASE_HOST"),
	DATABASE_PORT: +getEnvVariable("DATABASE_PORT"),
	DATABASE_USERNAME: getEnvVariable("DATABASE_USERNAME"),
	DATABASE_PASSWORD: getEnvVariable("DATABASE_PASSWORD"),
	DATABASE_NAME: getEnvVariable("DATABASE_NAME"),
	REDIS_URL: getEnvVariable("REDIS_URL"),
	BETTER_AUTH_URL: getEnvVariable("BETTER_AUTH_URL"),
	BETTER_AUTH_SECRET: getEnvVariable("BETTER_AUTH_SECRET"),
	API_KEY_SECRET: getEnvVariable("API_KEY_SECRET"),
	GOOGLE_CLIENT_ID: getEnvVariable("GOOGLE_CLIENT_ID"),
	GOOGLE_CLIENT_SECRET: getEnvVariable("GOOGLE_CLIENT_SECRET"),
	GITHUB_CLIENT_ID: getEnvVariable("GITHUB_CLIENT_ID"),
	GITHUB_CLIENT_SECRET: getEnvVariable("GITHUB_CLIENT_SECRET"),
	EMAIL_TRANSPORT_PROVIDER: getEnvVariable(
		"EMAIL_TRANSPORT_PROVIDER",
		"resend"
	),
	EMAIL_NOTIFICATION_FROM: getEnvVariable("EMAIL_NOTIFICATION_FROM", ""),
	EMAIL_MARKETING_FROM: getEnvVariable("EMAIL_MARKETING_FROM", ""),
	EMAIL_RESEND_INBOUND_DOMAIN: getEnvVariable(
		"EMAIL_RESEND_INBOUND_DOMAIN",
		"inbound.cossistant.com"
	),
	EMAIL_SES_INBOUND_DOMAIN: getEnvVariable(
		"EMAIL_SES_INBOUND_DOMAIN",
		"ses-inbound.cossistant.com"
	),
	RESEND_API_KEY: getEnvVariable("RESEND_API_KEY"),
	RESEND_AUDIENCE_ID: getEnvVariable("RESEND_AUDIENCE_ID"),
	RESEND_WEBHOOK_SECRET: getEnvVariable("RESEND_WEBHOOK_SECRET"),
	SES_REGION: getEnvVariable("SES_REGION", "us-east-1"),
	SES_ACCESS_KEY_ID: getEnvVariable("SES_ACCESS_KEY_ID", ""),
	SES_SECRET_ACCESS_KEY: getEnvVariable("SES_SECRET_ACCESS_KEY", ""),
	SES_CONFIGURATION_SET: getEnvVariable("SES_CONFIGURATION_SET", ""),
	SES_WEBHOOK_SECRET: getEnvVariable("SES_WEBHOOK_SECRET", ""),
	SLACK_WEBHOOK_URL: getEnvVariable("SLACK_WEBHOOK_URL", ""),
	PUBLIC_APP_URL: getEnvVariable("PUBLIC_APP_URL"),
	PORT: +getEnvVariable("PORT", "8787"),
	QSTASH_TOKEN: getEnvVariable("QSTASH_TOKEN"),
	POLAR_ACCESS_TOKEN: getEnvVariable("POLAR_ACCESS_TOKEN"),
	POLAR_WEBHOOK_SECRET: getEnvVariable("POLAR_WEBHOOK_SECRET"),
	POLAR_PRODUCT_ID_FREE_SANDBOX: getEnvVariable(
		"POLAR_PRODUCT_ID_FREE_SANDBOX",
		""
	),
	POLAR_PRODUCT_ID_FREE_PRODUCTION: getEnvVariable(
		"POLAR_PRODUCT_ID_FREE_PRODUCTION",
		""
	),
	POLAR_PRODUCT_ID_HOBBY_SANDBOX: getEnvVariable(
		"POLAR_PRODUCT_ID_HOBBY_SANDBOX",
		"b060ff1e-c2dd-4c02-a3e4-395d7cce84a0"
	),
	POLAR_PRODUCT_ID_HOBBY_PRODUCTION: getEnvVariable(
		"POLAR_PRODUCT_ID_HOBBY_PRODUCTION",
		"758ff687-1254-422f-9b4a-b23d39c6b47e"
	),
	POLAR_PRODUCT_ID_PRO_SANDBOX: getEnvVariable(
		"POLAR_PRODUCT_ID_PRO_SANDBOX",
		"c87aa036-2f0b-40da-9338-1a1fcc191543"
	),
	POLAR_PRODUCT_ID_PRO_PRODUCTION: getEnvVariable(
		"POLAR_PRODUCT_ID_PRO_PRODUCTION",
		"f34bf87c-96ab-4e54-9167-c4de8527669a"
	),
	POLAR_AI_USAGE_METER_ID: getEnvVariable("POLAR_AI_USAGE_METER_ID", ""),
	AI_CREDIT_USAGE_EVENT_NAME: getEnvVariable(
		"AI_CREDIT_USAGE_EVENT_NAME",
		"ai_usage"
	),
	AI_CREDIT_BALANCE_CACHE_TTL_SECONDS: +getEnvVariable(
		"AI_CREDIT_BALANCE_CACHE_TTL_SECONDS",
		"15"
	),
	AI_CREDIT_BALANCE_STALE_TTL_SECONDS: +getEnvVariable(
		"AI_CREDIT_BALANCE_STALE_TTL_SECONDS",
		"300"
	),
	AI_CREDIT_INGEST_BACKOFF_SECONDS: +getEnvVariable(
		"AI_CREDIT_INGEST_BACKOFF_SECONDS",
		"30"
	),
	QSTASH_CURRENT_SIGNING_KEY: getEnvVariable("QSTASH_CURRENT_SIGNING_KEY"),
	QSTASH_NEXT_SIGNING_KEY: getEnvVariable("QSTASH_NEXT_SIGNING_KEY"),
	QSTASH_URL: getEnvVariable("QSTASH_URL"),
	S3_BUCKET_NAME: getEnvVariable("S3_BUCKET_NAME"),
	S3_REGION: getEnvVariable("S3_REGION"),
	S3_ACCESS_KEY_ID: getEnvVariable("S3_ACCESS_KEY_ID"),
	S3_SECRET_ACCESS_KEY: getEnvVariable("S3_SECRET_ACCESS_KEY"),
	S3_ENDPOINT: getEnvVariable("S3_ENDPOINT", ""),
	S3_FORCE_PATH_STYLE:
		getEnvVariable("S3_FORCE_PATH_STYLE", "false") === "true",
	S3_SIGNED_URL_EXPIRATION_SECONDS: +getEnvVariable(
		"S3_SIGNED_URL_EXPIRATION_SECONDS",
		"900"
	),
	S3_PUBLIC_BASE_URL: getEnvVariable("S3_PUBLIC_BASE_URL", ""),
	S3_CDN_BASE_URL: getEnvVariable("S3_CDN_BASE_URL", ""),
	// VAPID keys for Web Push Notifications
	VAPID_PUBLIC_KEY: getEnvVariable("VAPID_PUBLIC_KEY"),
	VAPID_PRIVATE_KEY: getEnvVariable("VAPID_PRIVATE_KEY"),
	VAPID_SUBJECT: getEnvVariable("VAPID_SUBJECT"),
	// OpenRouter API key for AI agents
	OPENROUTER_API_KEY: getEnvVariable("OPENROUTER_API_KEY", ""),
	AI_AGENT_ROGUE_WINDOW_SECONDS: +getEnvVariable(
		"AI_AGENT_ROGUE_WINDOW_SECONDS",
		"60"
	),
	AI_AGENT_ROGUE_MAX_PUBLIC_MESSAGES: +getEnvVariable(
		"AI_AGENT_ROGUE_MAX_PUBLIC_MESSAGES",
		"8"
	),
	AI_AGENT_ROGUE_PAUSE_MINUTES: +getEnvVariable(
		"AI_AGENT_ROGUE_PAUSE_MINUTES",
		"15"
	),
	AI_AGENT_DEEP_TRACE_ENABLED:
		getEnvVariable("AI_AGENT_DEEP_TRACE_ENABLED", "false") === "true",
	AI_AGENT_TRACE_HEARTBEAT_MS: +getEnvVariable(
		"AI_AGENT_TRACE_HEARTBEAT_MS",
		"2000"
	),
	AI_AGENT_TRACE_PAYLOAD_MODE: getEnvVariable(
		"AI_AGENT_TRACE_PAYLOAD_MODE",
		defaultTracePayloadMode
	),
	// OpenRouter embedding model (default: text-embedding-3-small)
	OPENROUTER_EMBEDDING_MODEL: getEnvVariable(
		"OPENROUTER_EMBEDDING_MODEL",
		"openai/text-embedding-3-small"
	),
	// RAG service URL for chunking
	RAG_SERVICE_URL: getEnvVariable("RAG_SERVICE_URL", "http://localhost:8082"),
	// Private GeoIP service URL
	GEOIP_SERVICE_URL: getEnvVariable(
		"GEOIP_SERVICE_URL",
		"http://localhost:8083"
	),
	// Development-only override to simulate a public visitor IP locally
	LOCAL_VISITOR_IP_OVERRIDE: getEnvVariable("LOCAL_VISITOR_IP_OVERRIDE", ""),
	// Firecrawl API key for web scraping
	FIRECRAWL_API_KEY: getEnvVariable("FIRECRAWL_API_KEY", ""),
};
