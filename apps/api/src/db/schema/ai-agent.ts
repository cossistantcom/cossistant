import {
	type InferInsertModel,
	type InferSelectModel,
	relations,
} from "drizzle-orm";
import {
	boolean,
	doublePrecision,
	index,
	integer,
	jsonb,
	pgTable,
	text,
} from "drizzle-orm/pg-core";
import { ulidPrimaryKey, ulidReference } from "../../utils/db/ids";
import { isoTimestamp as timestamp } from "../../utils/db/timestamp";
import { organization } from "./auth";
import { conversationTimelineItem } from "./conversation";
import { knowledge } from "./knowledge";
import { website } from "./website";

/**
 * AI Agent Behavior Settings
 *
 * These settings control how the AI agent behaves in conversations.
 */
export type AiAgentBehaviorSettings = {
	// Legacy keys kept optional for backward compatibility
	responseMode?: "always" | "when_no_human" | "on_mention" | "manual";
	responseDelayMs?: number;
	pauseOnHumanReply?: boolean;
	pauseDurationMinutes?: number | null;

	// Capability toggles
	canResolve: boolean;
	canMarkSpam: boolean;
	canAssign: boolean;
	canSetPriority: boolean;
	canCategorize: boolean;
	canEscalate: boolean;
	canRequestKnowledgeClarification: boolean;

	// Escalation config
	defaultEscalationUserId: string | null;
	autoAssignOnEscalation?: boolean;
	maxToolInvocationsPerRun: number;

	// Background analysis (runs silently)
	autoAnalyzeSentiment: boolean;
	autoGenerateTitle: boolean;
	autoCategorize: boolean;
};

export const aiAgent = pgTable(
	"ai_agent",
	{
		id: ulidPrimaryKey("id"),
		name: text("name").notNull(),
		image: text("image"),
		description: text("description"),
		basePrompt: text("base_prompt").notNull(),
		model: text("model").notNull(),
		temperature: doublePrecision("temperature"),
		maxOutputTokens: integer("max_tokens"),
		organizationId: ulidReference("organization_id").references(
			() => organization.id,
			{ onDelete: "cascade" }
		),
		websiteId: ulidReference("website_id").references(() => website.id, {
			onDelete: "cascade",
		}),
		isActive: boolean("is_active").default(true).notNull(),
		lastUsedAt: timestamp("last_used_at"),
		lastTrainedAt: timestamp("last_trained_at"),
		// Training status fields
		trainingStatus: text("training_status").default("idle").notNull(),
		trainingProgress: integer("training_progress").default(0).notNull(),
		trainingError: text("training_error"),
		trainingStartedAt: timestamp("training_started_at"),
		trainedItemsCount: integer("trained_items_count"),
		usageCount: integer("usage_count").default(0).notNull(),
		goals: text("goals").array(),
		metadata: jsonb("metadata"),
		// Behavior settings for AI agent response control
		behaviorSettings:
			jsonb("behavior_settings").$type<AiAgentBehaviorSettings>(),
		// Onboarding completion timestamp - null means onboarding not yet completed
		onboardingCompletedAt: timestamp("onboarding_completed_at"),
		createdAt: timestamp("created_at")
			.$defaultFn(() => new Date().toISOString())
			.notNull(),
		updatedAt: timestamp("updated_at")
			.$defaultFn(() => new Date().toISOString())
			.notNull(),
		deletedAt: timestamp("deleted_at"),
	},
	(table) => [
		// Index for filtering by organization and website
		index("ai_agent_org_website_idx").on(table.organizationId, table.websiteId),
		// Index for active agents query
		index("ai_agent_active_idx").on(table.isActive),
		// Index for soft delete queries
		index("ai_agent_deleted_at_idx").on(table.deletedAt),
		// Index for training status queries
		index("ai_agent_training_status_idx").on(table.trainingStatus),
	]
);

export const aiAgentRelations = relations(aiAgent, ({ one, many }) => ({
	organization: one(organization, {
		fields: [aiAgent.organizationId],
		references: [organization.id],
	}),
	website: one(website, {
		fields: [aiAgent.websiteId],
		references: [website.id],
	}),
	conversationTimelineItems: many(conversationTimelineItem),
	knowledgeEntries: many(knowledge),
}));

export type AiAgentSelect = InferSelectModel<typeof aiAgent>;
export type AiAgentInsert = InferInsertModel<typeof aiAgent>;
