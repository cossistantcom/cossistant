import { env } from "@api/env";

export type FeatureKey =
	| "conversations"
	| "messages"
	| "contacts"
	| "conversation-retention"
	| "team-members"
	| "email-notifications"
	| "email-reply"
	| "dashboard-file-sharing"
	| "auto-translate"
	| "slack-support"
	| "slack-custom-channel"
	| "pro-integrations"
	| "rest-api"
	| "webhooks"
	| "self-host"
	| "custom-events"
	| "ai-workflows"
	| "ai-credit"
	| "openrouter-byok"
	| "latest-ai-models"
	| "custom-ai-skills"
	| "custom-ai-agent-avatar"
	| "ai-support-agents"
	| "ai-agent-training-links"
	| "ai-agent-training-mb"
	| "ai-agent-crawl-pages-per-source"
	| "ai-agent-training-pages-total"
	| "ai-agent-training-faqs"
	| "ai-agent-training-files"
	| "ai-agent-training-interval";

export type PlanName = "free" | "hobby" | "pro";

export type FeatureValue = number | boolean | null;

export type FeatureCategory = "primary" | "secondary";

export type FeatureConfig = {
	key: FeatureKey;
	name: string;
	description: string;
	unit?: string; // Unit for numeric values (e.g., "days", "MB", "credits")
	category: FeatureCategory; // Whether this is a primary or secondary feature
	comingSoon?: boolean; // Flag for coming soon features
};

export type PlanConfig = {
	name: PlanName;
	displayName: string;
	price?: number; // USD per month
	priceWithPromo?: number; // Promotional price (if available)
	isRecommended?: boolean; // Whether this plan is recommended
	polarProductId?: string; // For mapping to Polar products
	polarProductName?: string; // Alternative: map by name
	features: Record<FeatureKey, FeatureValue>; // null = unlimited, number = limit, boolean = included/not included
};

export const FEATURE_CONFIG: Record<FeatureKey, FeatureConfig> = {
	conversations: {
		key: "conversations",
		name: "Conversations",
		description:
			"Number of conversations that can be created in a rolling 30-day window",
		unit: "per rolling 30 days",
		category: "primary",
	},
	messages: {
		key: "messages",
		name: "Messages",
		description: "Total number of messages allowed in a rolling 30-day window",
		unit: "per rolling 30 days",
		category: "primary",
	},
	contacts: {
		key: "contacts",
		name: "Contacts",
		description: "Number of unique contacts that can be stored",
		unit: "contacts",
		category: "primary",
	},
	"conversation-retention": {
		key: "conversation-retention",
		name: "Conversation Retention",
		description: "How long conversations are stored and accessible",
		unit: "days",
		category: "primary",
	},
	"team-members": {
		key: "team-members",
		name: "Team Members",
		description: "Number of team members who can access the dashboard",
		unit: "seats",
		category: "primary",
	},
	"email-notifications": {
		key: "email-notifications",
		name: "Email Notifications",
		description: "Receive email notifications about new messages",
		category: "primary",
	},
	"email-reply": {
		key: "email-reply",
		name: "Reply via Email",
		description: "Reply to conversations directly from email",
		category: "primary",
	},
	"dashboard-file-sharing": {
		key: "dashboard-file-sharing",
		name: "Dashboard File Sharing",
		description: "Send files and images to visitors from the dashboard",
		category: "primary",
	},
	"auto-translate": {
		key: "auto-translate",
		name: "Auto Translate",
		description:
			"Automatically detect, translate, and reply in the visitor's language. Uses 1 AI credit per conversation when translation is activated.",
		category: "primary",
	},
	"slack-support": {
		key: "slack-support",
		name: "Slack Support by Founder",
		description: "Direct support from the founder via Slack",
		category: "secondary",
	},
	"slack-custom-channel": {
		key: "slack-custom-channel",
		name: "Custom Slack Channel",
		description: "Dedicated Slack channel for your team with priority support",
		category: "secondary",
	},
	"pro-integrations": {
		key: "pro-integrations",
		name: "Pro Integrations",
		description: "Advanced integrations with enterprise tools and custom APIs",
		category: "secondary",
	},
	"rest-api": {
		key: "rest-api",
		name: "REST API",
		description: "Access to REST API endpoints",
		category: "secondary",
	},
	webhooks: {
		key: "webhooks",
		name: "Webhooks",
		description: "Real-time event notifications via webhooks",
		category: "secondary",
		comingSoon: true,
	},
	"self-host": {
		key: "self-host",
		name: "Self Host Cossistant",
		description: "Run Cossistant on your own infrastructure",
		category: "secondary",
	},
	"custom-events": {
		key: "custom-events",
		name: "Custom Events",
		description:
			"Track and trigger custom events like visited pages, clicks or errors your users are experiencing",
		category: "secondary",
	},
	"ai-workflows": {
		key: "ai-workflows",
		name: "Custom Workflows",
		description: "Build automated workflows for your AI support operations",
		category: "secondary",
		comingSoon: true,
	},
	"ai-credit": {
		key: "ai-credit",
		name: "AI Credit",
		description: "Credits for AI-powered features and workflows",
		unit: "credits per month",
		category: "secondary",
	},
	"openrouter-byok": {
		key: "openrouter-byok",
		name: "Bring Your Own OpenRouter Key",
		description:
			"Use your own encrypted OpenRouter API key for website AI calls; fallback calls use normal Cossistant AI credits",
		category: "secondary",
	},
	"latest-ai-models": {
		key: "latest-ai-models",
		name: "Latest AI Models",
		description: "Access to the latest AI models",
		category: "secondary",
	},
	"custom-ai-skills": {
		key: "custom-ai-skills",
		name: "Custom AI Skills",
		description:
			"Create and use custom AI skills tailored to your support workflows",
		category: "secondary",
	},
	"custom-ai-agent-avatar": {
		key: "custom-ai-agent-avatar",
		name: "Custom AI Agent Avatar",
		description: "Upload a custom profile picture for your AI support agent",
		category: "secondary",
	},
	"ai-support-agents": {
		key: "ai-support-agents",
		name: "AI Support Agents",
		description: "Number of AI-powered support agents you can configure",
		unit: "agents",
		category: "secondary",
	},
	"ai-agent-training-links": {
		key: "ai-agent-training-links",
		name: "AI Agent Training Links",
		description: "Number of URLs for training AI agents on your content",
		unit: "links",
		category: "secondary",
	},
	"ai-agent-training-mb": {
		key: "ai-agent-training-mb",
		name: "AI Agent Training MB Size",
		description: "Maximum size of knowledge base for AI agent training",
		unit: "MB per AI agent",
		category: "secondary",
	},
	"ai-agent-crawl-pages-per-source": {
		key: "ai-agent-crawl-pages-per-source",
		name: "Crawl Pages Per Source",
		description: "Maximum number of pages to crawl per website source",
		unit: "pages",
		category: "secondary",
	},
	"ai-agent-training-pages-total": {
		key: "ai-agent-training-pages-total",
		name: "Total Training Pages",
		description:
			"Maximum total number of pages that can be crawled across all sources",
		unit: "pages",
		category: "secondary",
	},
	"ai-agent-training-faqs": {
		key: "ai-agent-training-faqs",
		name: "FAQ Entries",
		description: "Number of FAQ entries for AI agent training",
		unit: "FAQs",
		category: "secondary",
	},
	"ai-agent-training-files": {
		key: "ai-agent-training-files",
		name: "File Entries",
		description: "Number of file/article entries for AI agent training",
		unit: "files",
		category: "secondary",
	},
	"ai-agent-training-interval": {
		key: "ai-agent-training-interval",
		name: "AI Agent Training Interval",
		description: "Minimum time between AI agent training runs",
		unit: "minutes",
		category: "secondary",
	},
};

// Polar product IDs by environment
const POLAR_PRODUCT_IDS: Record<
	PlanName,
	{ sandbox: string; production?: string }
> = {
	free: {
		sandbox:
			env.POLAR_PRODUCT_ID_FREE_SANDBOX ||
			"4543a3c8-bbf6-47e2-84f6-0d78b334b15a",
		production:
			env.POLAR_PRODUCT_ID_FREE_PRODUCTION ||
			"4bdd01d7-6092-48ab-8589-0666ffab18fc",
	},
	hobby: {
		sandbox:
			env.POLAR_PRODUCT_ID_HOBBY_SANDBOX ||
			"b060ff1e-c2dd-4c02-a3e4-395d7cce84a0",
		production:
			env.POLAR_PRODUCT_ID_HOBBY_PRODUCTION ||
			"758ff687-1254-422f-9b4a-b23d39c6b47e",
	},
	pro: {
		sandbox:
			env.POLAR_PRODUCT_ID_PRO_SANDBOX ||
			"c87aa036-2f0b-40da-9338-1a1fcc191543",
		production:
			env.POLAR_PRODUCT_ID_PRO_PRODUCTION ||
			"f34bf87c-96ab-4e54-9167-c4de8527669a",
	},
};

function getPolarProductId(planName: PlanName): string | undefined {
	const isProduction = env.NODE_ENV === "production";
	const productIds = POLAR_PRODUCT_IDS[planName];
	return isProduction ? productIds.production : productIds.sandbox;
}

export const PLAN_CONFIG: Record<PlanName, PlanConfig> = {
	free: {
		name: "free",
		displayName: "Free",
		polarProductId: getPolarProductId("free"),
		polarProductName: "Free",
		features: {
			conversations: 20, // Limited conversations
			messages: 200, // Limited messages
			contacts: 25, // Limited contacts
			"conversation-retention": 30, // Days - conversations retained for 30 days
			"team-members": 1, // Limited team members
			"email-notifications": true, // Included
			"email-reply": true, // Included
			"dashboard-file-sharing": false, // Paid only
			"auto-translate": false, // Pro only
			"slack-support": false, // Paid only
			"slack-custom-channel": false, // Pro only
			"pro-integrations": false, // Pro only
			"rest-api": true, // Included
			webhooks: true, // Included (coming soon)
			"self-host": true, // Included
			"custom-events": true, // Included
			"ai-workflows": true, // Included (coming soon)
			"ai-credit": 50, // Limited AI credits
			"openrouter-byok": false, // Pro only
			"latest-ai-models": false, // Paid only
			"custom-ai-skills": true, // Included
			"custom-ai-agent-avatar": false, // Pro only
			"ai-support-agents": 1, // 1 AI agent
			"ai-agent-training-links": 5, // 5 training links
			"ai-agent-training-mb": 0.25, // 0.25 MB KB size
			"ai-agent-crawl-pages-per-source": 5, // 5 pages per crawl
			"ai-agent-training-pages-total": 5, // 5 pages total across all sources
			"ai-agent-training-faqs": 5, // 5 FAQs
			"ai-agent-training-files": 2, // 2 files
			"ai-agent-training-interval": 180, // Every 3 hours
		},
	},
	hobby: {
		name: "hobby",
		displayName: "Hobby",
		price: 30,
		priceWithPromo: 20,
		isRecommended: false,
		polarProductId: getPolarProductId("hobby"),
		polarProductName: "Hobby", // Map to Polar product name (can be overridden via env)
		features: {
			conversations: null, // Unlimited
			messages: null, // Unlimited
			contacts: 2000,
			"conversation-retention": null, // Full retention (unlimited)
			"team-members": 2, // 2 team members
			"email-notifications": true, // Included
			"email-reply": true, // Included
			"dashboard-file-sharing": true, // Included
			"auto-translate": false, // Pro only
			"slack-support": true, // Included
			"slack-custom-channel": false, // Pro only
			"pro-integrations": false, // Pro only
			"rest-api": true, // Included
			webhooks: true, // Included (coming soon)
			"self-host": true, // Included
			"custom-events": true, // Included
			"ai-workflows": true, // Included (coming soon)
			"ai-credit": 1000, // Higher AI credits
			"openrouter-byok": false, // Pro only
			"latest-ai-models": true, // Included
			"custom-ai-skills": true, // Included
			"custom-ai-agent-avatar": false, // Pro only
			"ai-support-agents": 1, // 1 AI agent
			"ai-agent-training-links": null, // Unlimited training links
			"ai-agent-training-mb": 10, // 10 MB KB size
			"ai-agent-crawl-pages-per-source": 1000, // 1000 pages per crawl
			"ai-agent-training-pages-total": null, // Unlimited total pages
			"ai-agent-training-faqs": null, // Unlimited FAQs
			"ai-agent-training-files": null, // Unlimited files
			"ai-agent-training-interval": 10, // Every 10 minutes
		},
	},
	pro: {
		name: "pro",
		displayName: "Pro",
		price: 90,
		priceWithPromo: 40,
		isRecommended: true,
		polarProductId: getPolarProductId("pro"),
		polarProductName: "Pro",
		features: {
			conversations: null, // Unlimited
			messages: null, // Unlimited
			contacts: 6000, // Triple the Hobby limit
			"conversation-retention": null, // Full retention (unlimited)
			"team-members": 4, // 4 team member seats
			"email-notifications": true, // Included
			"email-reply": true, // Included
			"dashboard-file-sharing": true, // Included
			"auto-translate": true, // Included
			"slack-support": true, // Included
			"slack-custom-channel": true, // Custom Slack channel included
			"pro-integrations": true, // Pro integrations included
			"rest-api": true, // Included
			webhooks: true, // Included (coming soon)
			"self-host": true, // Included
			"custom-events": true, // Included
			"ai-workflows": true, // Included (coming soon)
			"ai-credit": 3000, // Triple AI credits
			"openrouter-byok": true, // Included
			"latest-ai-models": true, // Included
			"custom-ai-skills": true, // Included
			"custom-ai-agent-avatar": true, // Included
			"ai-support-agents": 1, // 1 AI agent
			"ai-agent-training-links": null, // Unlimited training links
			"ai-agent-training-mb": 40, // 40 MB KB size
			"ai-agent-crawl-pages-per-source": 1000, // 1000 pages per crawl
			"ai-agent-training-pages-total": null, // Unlimited total pages
			"ai-agent-training-faqs": null, // Unlimited FAQs
			"ai-agent-training-files": null, // Unlimited files
			"ai-agent-training-interval": 0, // Anytime
		},
	},
};

/**
 * Get plan configuration by name
 */
export function getPlanConfig(planName: PlanName): PlanConfig {
	return PLAN_CONFIG[planName];
}

/**
 * Get default plan (free)
 */
export function getDefaultPlan(): PlanConfig {
	return PLAN_CONFIG.free;
}

/**
 * Map Polar product name/ID to internal plan name
 */
export function mapPolarProductToPlan(
	polarProductName?: string,
	polarProductId?: string
): PlanName | null {
	if (!(polarProductName || polarProductId)) {
		return null;
	}

	// Check by product name first
	for (const [planName, config] of Object.entries(PLAN_CONFIG)) {
		if (config.polarProductName === polarProductName) {
			return planName as PlanName;
		}
		if (config.polarProductId === polarProductId) {
			return planName as PlanName;
		}
	}

	return null;
}
