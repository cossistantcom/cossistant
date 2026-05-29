export const LIFECYCLE_EMAIL_KEYS = {
	WELCOME: "welcome",
	SETUP_WIDGET: "setup_widget",
	CUSTOMIZE_WIDGET: "customize_widget",
	COLLECT_FEEDBACK: "collect_feedback",
	AI_AGENT_HELP: "ai_agent_help",
	WEEKLY_DIGEST: "weekly_digest",
	LIMIT_WARNING: "limit_warning",
} as const;

export type LifecycleEmailKey =
	(typeof LIFECYCLE_EMAIL_KEYS)[keyof typeof LIFECYCLE_EMAIL_KEYS];

export type LifecycleEmailMetadata = {
	websiteId?: string;
	websiteName?: string;
	websiteSlug?: string;
	organizationName?: string;
	weekKey?: string;
	limitName?: string;
	limitUsed?: number;
	limitValue?: number;
	limitUnit?: string;
} | null;
