import {
	ConversationEventType,
	ConversationFieldSource,
	ConversationParticipationStatus,
	ConversationPriority,
	ConversationSentiment,
	ConversationStatus,
	ConversationTimelineType,
	TimelineItemVisibility,
} from "@cossistant/types";

import {
	type InferInsertModel,
	type InferSelectModel,
	relations,
	sql,
} from "drizzle-orm";

import {
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	real,
	text,
	uniqueIndex,
} from "drizzle-orm/pg-core";

import { enumToPgEnum } from "../../utils/db";

import {
	nanoidPrimaryKey,
	nanoidReference,
	ulidNullableReference,
	ulidPrimaryKey,
	ulidReference,
} from "../../utils/db/ids";

import { isoTimestamp as timestamp } from "../../utils/db/timestamp";

import { aiAgent } from "./ai-agent";
import { organization, user } from "./auth";
import { view, visitor, website } from "./website";

export const conversationStatusEnum = pgEnum(
	"conversation_status",
	enumToPgEnum(ConversationStatus)
);

export const conversationPriorityEnum = pgEnum(
	"conversation_priority",
	enumToPgEnum(ConversationPriority)
);

export const conversationSentimentEnum = pgEnum(
	"conversation_sentiment",
	enumToPgEnum(ConversationSentiment)
);

export const conversationTitleSourceEnum = pgEnum("conversation_title_source", [
	"ai",
	"user",
]);

export const conversationFieldSourceEnum = pgEnum(
	"conversation_field_source",
	enumToPgEnum(ConversationFieldSource)
);

export const itemVisibilityEnum = pgEnum(
	"item_visibility",
	enumToPgEnum(TimelineItemVisibility)
);

export const conversationEventTypeEnum = pgEnum(
	"conversation_event_type",
	enumToPgEnum(ConversationEventType)
);

export const conversationParticipationStatusEnum = pgEnum(
	"conversation_participation_status",
	enumToPgEnum(ConversationParticipationStatus)
);

export const conversationTimelineTypeEnum = pgEnum(
	"conversation_timeline_type",
	enumToPgEnum(ConversationTimelineType)
);

// Conversation Timeline Item
export const conversationTimelineItem = pgTable(
	"conversation_timeline_item",
	{
		id: ulidPrimaryKey("id"),
		conversationId: nanoidReference("conversation_id").references(
			() => conversation.id,
			{ onDelete: "cascade" }
		),
		organizationId: ulidReference("organization_id").references(
			() => organization.id,
			{ onDelete: "cascade" }
		),
		visibility: itemVisibilityEnum("visibility")
			.default(TimelineItemVisibility.PUBLIC)
			.notNull(),
		type: conversationTimelineTypeEnum("type").notNull(),
		text: text("text"),
		parts: jsonb("parts").default(sql`'[]'::jsonb`).notNull(),
		// One of userId or aiAgentId should be present (enforced at application level)
		userId: ulidNullableReference("user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		visitorId: ulidNullableReference("visitor_id").references(
			() => visitor.id,
			{
				onDelete: "set null",
			}
		),
		aiAgentId: ulidNullableReference("ai_agent_id").references(
			() => aiAgent.id,
			{ onDelete: "set null" }
		),
		createdAt: timestamp("created_at")
			.$defaultFn(() => new Date().toISOString())
			.notNull(),
		deletedAt: timestamp("deleted_at"),
	},
	(table) => [
		index("conversation_timeline_item_org_conv_visibility_idx").on(
			table.organizationId,
			table.conversationId,
			table.visibility
		),
		index("conversation_timeline_item_conv_created_idx").on(
			table.conversationId,
			table.createdAt,
			table.id
		),
		// Index for counting messages by organization, type, and deleted status
		index("conversation_timeline_item_org_type_deleted_idx").on(
			table.organizationId,
			table.type,
			table.deletedAt
		),
	]
);

export const conversation = pgTable(
	"conversation",
	{
		id: nanoidPrimaryKey("id"),
		status: conversationStatusEnum("status")
			.default(ConversationStatus.OPEN)
			.notNull(),
		priority: conversationPriorityEnum("priority")
			.default(ConversationPriority.NORMAL)
			.notNull(),
		prioritySource: conversationFieldSourceEnum("priority_source"),
		organizationId: ulidReference("organization_id").references(
			() => organization.id,
			{ onDelete: "cascade" }
		),
		visitorId: ulidReference("visitor_id").references(() => visitor.id, {
			onDelete: "cascade",
		}),
		websiteId: ulidReference("website_id").references(() => website.id, {
			onDelete: "cascade",
		}),

		sentiment: conversationSentimentEnum("sentiment"),
		sentimentConfidence: real("sentiment_confidence"),
		sentimentSource: conversationFieldSourceEnum("sentiment_source"),
		channel: text("channel").notNull().default("widget"),
		title: text("title"),
		visitorTitle: text("visitor_title"),
		visitorTitleLanguage: text("visitor_title_language"),
		visitorLanguage: text("visitor_language"),
		metadata: jsonb("metadata").$type<Record<
			string,
			string | number | boolean | null
		> | null>(),
		titleSource: conversationTitleSourceEnum("title_source"),
		translationActivatedAt: timestamp("translation_activated_at"),
		translationChargedAt: timestamp("translation_charged_at"),
		resolutionTime: integer("resolution_time"), // in seconds
		visitorRating: integer("visitor_rating"), // 1-5 scale
		visitorRatingAt: timestamp("visitor_rating_at"),
		startedAt: timestamp("started_at").$defaultFn(() =>
			new Date().toISOString()
		),
		firstResponseAt: timestamp("first_response_at"),
		resolvedAt: timestamp("resolved_at"),
		// last message ref, useful for read / unread states + urgency
		lastMessageAt: timestamp("last_message_at"),
		lastMessageBy: ulidNullableReference("last_message_by_id"),
		resolvedByUserId: ulidNullableReference("resolved_by_user_id").references(
			() => user.id,
			{ onDelete: "set null" }
		),
		resolvedByAiAgentId: ulidNullableReference(
			"resolved_by_ai_agent_id"
		).references(() => aiAgent.id, { onDelete: "set null" }),

		// AI Agent escalation tracking
		escalatedAt: timestamp("escalated_at"),
		escalatedByAiAgentId: ulidNullableReference(
			"escalated_by_ai_agent_id"
		).references(() => aiAgent.id, { onDelete: "set null" }),
		escalationReason: text("escalation_reason"),
		// When the escalation was handled by a human (null = still escalated)
		escalationHandledAt: timestamp("escalation_handled_at"),
		// Which human agent handled the escalation
		escalationHandledByUserId: ulidNullableReference(
			"escalation_handled_by_user_id"
		).references(() => user.id, { onDelete: "set null" }),
		// AI pause control - when set, AI will not respond until this time
		aiPausedUntil: timestamp("ai_paused_until"),
		// AI agent processing cursor for ordered message handling
		aiAgentLastProcessedMessageId: ulidNullableReference(
			"ai_agent_last_processed_message_id"
		),
		aiAgentLastProcessedMessageCreatedAt: timestamp(
			"ai_agent_last_processed_message_created_at"
		),
		createdAt: timestamp("created_at")
			.$defaultFn(() => new Date().toISOString())
			.notNull(),
		updatedAt: timestamp("updated_at")
			.$defaultFn(() => new Date().toISOString())
			.notNull(),
		deletedAt: timestamp("deleted_at"),
	},
	(table) => [
		// Index for tenant-scoped queries (most important)
		index("conversation_org_idx").on(table.organizationId),
		// Composite index for organization + status queries
		index("conversation_org_status_idx").on(table.organizationId, table.status),
		// Composite index for organization + priority queries
		index("conversation_org_priority_idx").on(
			table.organizationId,
			table.priority
		),
		// Index for filtering conversations by website and status
		index("conversation_website_status_idx").on(table.websiteId, table.status),
		// Index for filtering conversations by visitor
		index("conversation_visitor_idx").on(table.visitorId),
		// Index for resolution data
		index("conversation_org_resolved_idx").on(
			table.organizationId,
			table.resolvedAt
		),
		index("conversation_org_website_started_idx").on(
			table.organizationId,
			table.websiteId,
			table.startedAt,
			table.deletedAt
		),
		index("conversation_org_website_first_response_idx").on(
			table.organizationId,
			table.websiteId,
			table.firstResponseAt,
			table.deletedAt
		),
		index("conversation_org_website_resolved_idx").on(
			table.organizationId,
			table.websiteId,
			table.resolvedAt,
			table.deletedAt
		),
		index("conversation_org_website_rating_idx").on(
			table.organizationId,
			table.websiteId,
			table.visitorRatingAt,
			table.deletedAt
		),
		// Index for filtering conversations by website for the sync db
		index("conversation_org_website_idx").on(table.websiteId, table.updatedAt),
		index("conversation_org_first_response_idx").on(
			table.organizationId,
			table.firstResponseAt
		),
		// Composite index for counting conversations by website and organization
		index("conversation_website_org_deleted_idx").on(
			table.websiteId,
			table.organizationId,
			table.deletedAt
		),
		// Optimized composite index for listConversationsHeaders pagination by updatedAt
		index("conversation_org_website_updated_idx").on(
			table.organizationId,
			table.websiteId,
			table.updatedAt,
			table.id
		),
		// Optimized composite index for listConversationsHeaders pagination by createdAt
		index("conversation_org_website_created_idx").on(
			table.organizationId,
			table.websiteId,
			table.createdAt,
			table.id
		),
		// Index for soft delete queries
		index("conversation_deleted_at_idx").on(table.deletedAt),
	]
);

export const conversationSeen = pgTable(
	"conversation_seen",
	{
		id: ulidPrimaryKey("id"),
		organizationId: ulidReference("organization_id").references(
			() => organization.id,
			{ onDelete: "cascade" }
		),
		conversationId: nanoidReference("conversation_id").references(
			() => conversation.id,
			{ onDelete: "cascade" }
		),

		// exactly one of these is non-null
		userId: ulidNullableReference("user_id").references(() => user.id, {
			onDelete: "cascade",
		}),
		visitorId: ulidNullableReference("visitor_id").references(
			() => visitor.id,
			{ onDelete: "cascade" }
		),
		aiAgentId: ulidNullableReference("ai_agent_id").references(
			() => aiAgent.id,
			{ onDelete: "cascade" }
		),

		lastSeenAt: timestamp("last_seen_at")
			.$defaultFn(() => new Date().toISOString())
			.notNull(),
		createdAt: timestamp("created_at")
			.$defaultFn(() => new Date().toISOString())
			.notNull(),
		updatedAt: timestamp("updated_at")
			.$defaultFn(() => new Date().toISOString())
			.notNull(),
	},
	(t) => [
		index("cs_org_idx").on(t.organizationId),
		index("cs_conv_last_seen_idx").on(t.conversationId, t.lastSeenAt),

		// one row per actor per conversation (NULLs don’t collide)
		uniqueIndex("cs_unique_user").on(t.conversationId, t.userId),
		uniqueIndex("cs_unique_visitor").on(t.conversationId, t.visitorId),
		uniqueIndex("cs_unique_ai").on(t.conversationId, t.aiAgentId),
	]
);

export const conversationAssignee = pgTable(
	"conversation_assignee",
	{
		id: ulidPrimaryKey("id"),
		organizationId: ulidReference("organization_id").references(
			() => organization.id,
			{ onDelete: "cascade" }
		),
		conversationId: nanoidReference("conversation_id").references(
			() => conversation.id,
			{ onDelete: "cascade" }
		),
		userId: ulidReference("user_id").references(() => user.id, {
			onDelete: "cascade",
		}),
		assignedByUserId: ulidNullableReference("assigned_by_user_id").references(
			() => user.id,
			{ onDelete: "set null" }
		),
		assignedByAiAgentId: ulidNullableReference(
			"assigned_by_ai_agent_id"
		).references(() => aiAgent.id, { onDelete: "set null" }),
		assignedAt: timestamp("assigned_at")
			.$defaultFn(() => new Date().toISOString())
			.notNull(),
		unassignedAt: timestamp("unassigned_at"),
		createdAt: timestamp("created_at")
			.$defaultFn(() => new Date().toISOString())
			.notNull(),
	},
	(table) => [
		index("conversation_assignee_org_idx").on(table.organizationId),
		index("conversation_assignee_conv_idx").on(table.conversationId),
		index("conversation_assignee_user_idx").on(table.userId),
		uniqueIndex("conversation_assignee_unique").on(
			table.conversationId,
			table.userId
		),
	]
);

export const conversationParticipant = pgTable(
	"conversation_participant",
	{
		id: ulidPrimaryKey("id"),
		organizationId: ulidReference("organization_id").references(
			() => organization.id,
			{ onDelete: "cascade" }
		),
		conversationId: nanoidReference("conversation_id").references(
			() => conversation.id,
			{ onDelete: "cascade" }
		),
		userId: ulidReference("user_id").references(() => user.id, {
			onDelete: "cascade",
		}),
		status: conversationParticipationStatusEnum("status")
			.default(ConversationParticipationStatus.ACTIVE)
			.notNull(),
		reason: text("reason"),
		requestedByUserId: ulidNullableReference("requested_by_user_id").references(
			() => user.id,
			{ onDelete: "set null" }
		),
		requestedByAiAgentId: ulidNullableReference(
			"requested_by_ai_agent_id"
		).references(() => aiAgent.id, { onDelete: "set null" }),
		joinedAt: timestamp("joined_at")
			.$defaultFn(() => new Date().toISOString())
			.notNull(),
		leftAt: timestamp("left_at"),
		createdAt: timestamp("created_at")
			.$defaultFn(() => new Date().toISOString())
			.notNull(),
	},
	(table) => [
		index("conversation_participant_org_idx").on(table.organizationId),
		index("conversation_participant_conv_idx").on(table.conversationId),
		index("conversation_participant_user_idx").on(table.userId),
		uniqueIndex("conversation_participant_unique").on(
			table.conversationId,
			table.userId
		),
	]
);

export const conversationView = pgTable(
	"conversation_view",
	{
		id: ulidPrimaryKey("id"),
		organizationId: ulidReference("organization_id").references(
			() => organization.id,
			{ onDelete: "cascade" }
		),
		conversationId: nanoidReference("conversation_id").references(
			() => conversation.id,
			{ onDelete: "cascade" }
		),
		viewId: ulidReference("view_id").references(() => view.id, {
			onDelete: "cascade",
		}),

		addedByUserId: ulidNullableReference("added_by_user_id").references(
			() => user.id,
			{ onDelete: "set null" }
		),
		addedByAiAgentId: ulidNullableReference("added_by_ai_agent_id").references(
			() => aiAgent.id,
			{ onDelete: "set null" }
		),
		createdAt: timestamp("created_at")
			.$defaultFn(() => new Date().toISOString())
			.notNull(),
		deletedAt: timestamp("deleted_at"),
	},
	(table) => [
		index("conversation_view_org_idx").on(table.organizationId),
		index("conversation_view_conv_idx").on(table.conversationId),
		index("conversation_view_view_idx").on(table.viewId),
		// Composite index for efficient aggregation in listConversationsHeaders
		index("conversation_view_org_conv_deleted_idx").on(
			table.organizationId,
			table.conversationId,
			table.deletedAt
		),
		uniqueIndex("conversation_view_unique").on(
			table.conversationId,
			table.viewId
		),
		index("conversation_view_deleted_at_idx").on(table.deletedAt),
	]
);

export const conversationRelations = relations(
	conversation,
	({ one, many }) => ({
		organization: one(organization, {
			fields: [conversation.organizationId],
			references: [organization.id],
		}),
		website: one(website, {
			fields: [conversation.websiteId],
			references: [website.id],
		}),
		visitor: one(visitor, {
			fields: [conversation.visitorId],
			references: [visitor.id],
		}),
		timelineItems: many(conversationTimelineItem),
		assignees: many(conversationAssignee),
		participants: many(conversationParticipant),
		views: many(conversationView),
		seenBy: many(conversationSeen),
	})
);

export const conversationTimelineRelations = relations(
	conversationTimelineItem,
	({ one }) => ({
		organization: one(organization, {
			fields: [conversationTimelineItem.organizationId],
			references: [organization.id],
		}),
		conversation: one(conversation, {
			fields: [conversationTimelineItem.conversationId],
			references: [conversation.id],
		}),
		user: one(user, {
			fields: [conversationTimelineItem.userId],
			references: [user.id],
		}),
		aiAgent: one(aiAgent, {
			fields: [conversationTimelineItem.aiAgentId],
			references: [aiAgent.id],
		}),
		visitor: one(visitor, {
			fields: [conversationTimelineItem.visitorId],
			references: [visitor.id],
		}),
	})
);

export const conversationTagRelations = relations(
	conversationView,
	({ one }) => ({
		organization: one(organization, {
			fields: [conversationView.organizationId],
			references: [organization.id],
		}),
		conversation: one(conversation, {
			fields: [conversationView.conversationId],
			references: [conversation.id],
		}),
		view: one(view, {
			fields: [conversationView.viewId],
			references: [view.id],
		}),
		addedByUser: one(user, {
			fields: [conversationView.addedByUserId],
			references: [user.id],
		}),
		addedByAiAgent: one(aiAgent, {
			fields: [conversationView.addedByAiAgentId],
			references: [aiAgent.id],
		}),
	})
);

export type ConversationSelect = InferSelectModel<typeof conversation>;
export type ConversationInsert = InferInsertModel<typeof conversation>;

export type ConversationAssigneeSelect = InferSelectModel<
	typeof conversationAssignee
>;
export type ConversationAssigneeInsert = InferInsertModel<
	typeof conversationAssignee
>;

export type ConversationParticipantSelect = InferSelectModel<
	typeof conversationParticipant
>;
export type ConversationParticipantInsert = InferInsertModel<
	typeof conversationParticipant
>;

export type ConversationViewSelect = InferSelectModel<typeof conversationView>;
export type ConversationViewInsert = InferInsertModel<typeof conversationView>;

// Timeline items
export type ConversationTimelineItemSelect = InferSelectModel<
	typeof conversationTimelineItem
>;

export type ConversationTimelineItemInsert = InferInsertModel<
	typeof conversationTimelineItem
>;
