import type { KnowledgeClarificationContextSnapshot } from "@api/lib/knowledge-clarification-context";
import type {
	KnowledgeClarificationDraftFaq,
	KnowledgeClarificationQuestionPlan,
} from "@plasma/types";
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
	text,
	uniqueIndex,
	varchar,
} from "drizzle-orm/pg-core";
import {
	ulidNullableReference,
	ulidPrimaryKey,
	ulidReference,
} from "../../utils/db/ids";
import { isoTimestamp as timestamp } from "../../utils/db/timestamp";
import { aiAgent } from "./ai-agent";
import { organization } from "./auth";
import { conversation } from "./conversation";
import { knowledge } from "./knowledge";
import { website } from "./website";

export const knowledgeClarificationSourceEnum = pgEnum(
	"knowledge_clarification_source",
	["conversation", "faq"]
);

export const knowledgeClarificationStatusEnum = pgEnum(
	"knowledge_clarification_status",
	[
		"analyzing",
		"awaiting_answer",
		"retry_required",
		"draft_ready",
		"deferred",
		"applied",
		"dismissed",
	]
);

export const knowledgeClarificationTurnRoleEnum = pgEnum(
	"knowledge_clarification_turn_role",
	["ai_question", "human_answer", "human_skip"]
);

export const knowledgeClarificationRequest = pgTable(
	"knowledge_clarification_request",
	{
		id: ulidPrimaryKey("id"),
		organizationId: ulidReference("organization_id").references(
			() => organization.id,
			{ onDelete: "cascade" }
		),
		websiteId: ulidReference("website_id").references(() => website.id, {
			onDelete: "cascade",
		}),
		aiAgentId: ulidReference("ai_agent_id").references(() => aiAgent.id, {
			onDelete: "cascade",
		}),
		conversationId: varchar("conversation_id", { length: 18 }).references(
			() => conversation.id,
			{ onDelete: "set null" }
		),
		source: knowledgeClarificationSourceEnum("source").notNull(),
		status: knowledgeClarificationStatusEnum("status")
			.default("awaiting_answer")
			.notNull(),
		topicSummary: text("topic_summary").notNull(),
		sourceTriggerMessageId: text("source_trigger_message_id"),
		topicFingerprint: varchar("topic_fingerprint", { length: 32 }),
		stepIndex: integer("step_index").notNull().default(0),
		maxSteps: integer("max_steps").notNull().default(3),
		contextSnapshot:
			jsonb("context_snapshot").$type<KnowledgeClarificationContextSnapshot>(),
		targetKnowledgeId: ulidNullableReference("target_knowledge_id").references(
			() => knowledge.id,
			{ onDelete: "set null" }
		),
		questionPlan:
			jsonb("question_plan").$type<KnowledgeClarificationQuestionPlan>(),
		draftFaqPayload:
			jsonb("draft_faq_payload").$type<KnowledgeClarificationDraftFaq>(),
		lastError: text("last_error"),
		createdAt: timestamp("created_at")
			.$defaultFn(() => new Date().toISOString())
			.notNull(),
		updatedAt: timestamp("updated_at")
			.$defaultFn(() => new Date().toISOString())
			.notNull(),
	},
	(table) => [
		index("knowledge_clarification_request_website_idx").on(table.websiteId),
		index("knowledge_clarification_request_ai_agent_idx").on(table.aiAgentId),
		index("knowledge_clarification_request_conversation_idx").on(
			table.conversationId
		),
		index("knowledge_clarification_request_status_idx").on(table.status),
		index("knowledge_clarification_request_source_trigger_message_idx").on(
			table.sourceTriggerMessageId
		),
		index("knowledge_clarification_request_topic_fingerprint_idx").on(
			table.topicFingerprint
		),
		index("knowledge_clarification_request_target_knowledge_idx").on(
			table.targetKnowledgeId
		),
		uniqueIndex("knowledge_clarification_request_conv_trigger_unique")
			.on(table.conversationId, table.sourceTriggerMessageId)
			.where(
				sql`${table.conversationId} is not null and ${table.sourceTriggerMessageId} is not null`
			),
		uniqueIndex("knowledge_clarification_request_conv_topic_fingerprint_unique")
			.on(table.conversationId, table.topicFingerprint)
			.where(
				sql`${table.source} = 'conversation' and ${table.conversationId} is not null and ${table.sourceTriggerMessageId} is null and ${table.topicFingerprint} is not null and ${table.status} in ('analyzing', 'awaiting_answer', 'retry_required', 'draft_ready', 'deferred')`
			),
	]
);

export const knowledgeClarificationTurn = pgTable(
	"knowledge_clarification_turn",
	{
		id: ulidPrimaryKey("id"),
		requestId: ulidReference("request_id").references(
			() => knowledgeClarificationRequest.id,
			{ onDelete: "cascade" }
		),
		role: knowledgeClarificationTurnRoleEnum("role").notNull(),
		question: text("question"),
		suggestedAnswers: text("suggested_answers").array(),
		selectedAnswer: text("selected_answer"),
		freeAnswer: text("free_answer"),
		createdAt: timestamp("created_at")
			.$defaultFn(() => new Date().toISOString())
			.notNull(),
		updatedAt: timestamp("updated_at")
			.$defaultFn(() => new Date().toISOString())
			.notNull(),
	},
	(table) => [
		index("knowledge_clarification_turn_request_idx").on(table.requestId),
		index("knowledge_clarification_turn_role_idx").on(table.role),
	]
);

export const knowledgeClarificationRequestRelations = relations(
	knowledgeClarificationRequest,
	({ one, many }) => ({
		organization: one(organization, {
			fields: [knowledgeClarificationRequest.organizationId],
			references: [organization.id],
		}),
		website: one(website, {
			fields: [knowledgeClarificationRequest.websiteId],
			references: [website.id],
		}),
		agent: one(aiAgent, {
			fields: [knowledgeClarificationRequest.aiAgentId],
			references: [aiAgent.id],
		}),
		conversation: one(conversation, {
			fields: [knowledgeClarificationRequest.conversationId],
			references: [conversation.id],
		}),
		targetKnowledge: one(knowledge, {
			fields: [knowledgeClarificationRequest.targetKnowledgeId],
			references: [knowledge.id],
		}),
		turns: many(knowledgeClarificationTurn),
	})
);

export const knowledgeClarificationTurnRelations = relations(
	knowledgeClarificationTurn,
	({ one }) => ({
		request: one(knowledgeClarificationRequest, {
			fields: [knowledgeClarificationTurn.requestId],
			references: [knowledgeClarificationRequest.id],
		}),
	})
);

export type KnowledgeClarificationRequestSelect = InferSelectModel<
	typeof knowledgeClarificationRequest
>;
export type KnowledgeClarificationRequestInsert = InferInsertModel<
	typeof knowledgeClarificationRequest
>;
export type KnowledgeClarificationTurnSelect = InferSelectModel<
	typeof knowledgeClarificationTurn
>;
export type KnowledgeClarificationTurnInsert = InferInsertModel<
	typeof knowledgeClarificationTurn
>;
