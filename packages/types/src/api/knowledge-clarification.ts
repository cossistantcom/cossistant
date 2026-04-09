import { z } from "@hono/zod-openapi";
import { apiTimestampSchema } from "./common";
import {
	faqKnowledgePayloadSchema,
	knowledgeResponseSchema,
} from "./knowledge";

export const knowledgeClarificationSourceSchema = z
	.enum(["conversation", "faq"])
	.openapi({
		description: "How the clarification request was created.",
		example: "conversation",
	});

export const knowledgeClarificationStatusSchema = z
	.enum([
		"analyzing",
		"awaiting_answer",
		"retry_required",
		"draft_ready",
		"deferred",
		"applied",
		"dismissed",
	])
	.openapi({
		description: "Current lifecycle status for the clarification request.",
		example: "awaiting_answer",
	});

export const activeConversationKnowledgeClarificationStatusSchema = z
	.union([
		z.literal("analyzing"),
		z.literal("awaiting_answer"),
		z.literal("retry_required"),
		z.literal("draft_ready"),
	])
	.openapi({
		description:
			"Clarification statuses that should appear on active conversation surfaces.",
		example: "awaiting_answer",
	});

export const knowledgeClarificationTurnRoleSchema = z
	.enum(["ai_question", "human_answer", "human_skip"])
	.openapi({
		description: "Actor role for a clarification turn.",
		example: "ai_question",
	});

export const knowledgeClarificationSuggestedAnswersSchema = z
	.array(z.string().min(1))
	.length(3)
	.openapi({
		description: "Exactly three suggested answers for the current question.",
		example: [
			"It applies to all plans.",
			"It only applies to paid plans.",
			"It depends on the feature flag.",
		],
	});

export const knowledgeClarificationQuestionInputModeSchema = z
	.enum(["textarea_first", "suggested_answers"])
	.openapi({
		description: "How the current clarification question should be answered.",
		example: "textarea_first",
	});

export const knowledgeClarificationQuestionScopeSchema = z
	.enum(["broad_discovery", "narrow_detail"])
	.openapi({
		description:
			"Whether the current clarification question is broad or narrow.",
		example: "broad_discovery",
	});

export const knowledgeClarificationEngagementModeSchema = z
	.enum(["owner", "linked"])
	.openapi({
		description:
			"Whether the current conversation owns the clarification flow or is only linked to it.",
		example: "owner",
	});

export const knowledgeClarificationTargetKnowledgeSummarySchema = z
	.object({
		id: z.ulid(),
		question: z.string().nullable(),
		sourceTitle: z.string().nullable(),
	})
	.openapi({
		description: "Summary of the FAQ currently targeted by this clarification.",
	});

export const knowledgeClarificationPlannedQuestionSchema = z
	.object({
		id: z.string().min(1).max(80),
		question: z.string().min(1).max(500),
		suggestedAnswers: knowledgeClarificationSuggestedAnswersSchema,
		inputMode: knowledgeClarificationQuestionInputModeSchema,
		questionScope: knowledgeClarificationQuestionScopeSchema,
		missingFact: z.string().min(1).max(280),
		whyItMatters: z.string().min(1).max(400),
	})
	.openapi({
		description:
			"A pre-generated clarification question that can be asked later in the flow.",
	});

export const knowledgeClarificationQuestionPlanSchema = z
	.array(knowledgeClarificationPlannedQuestionSchema)
	.max(3)
	.openapi({
		description:
			"Pre-generated clarification questions stored for the active request.",
	});

export const knowledgeClarificationDraftFaqSchema = faqKnowledgePayloadSchema
	.extend({
		title: z.string().nullable().optional().openapi({
			description:
				"Optional proposal title for dashboard review without affecting the saved FAQ payload.",
			example: "Clarify seat limits by plan",
		}),
	})
	.openapi({
		description: "Draft FAQ proposal generated from the clarification flow.",
	});

export const conversationClarificationProgressPhaseSchema = z
	.enum([
		"loading_context",
		"reviewing_evidence",
		"planning_questions",
		"evaluating_answer",
		"generating_draft",
		"retrying_generation",
		"finalizing_step",
	])
	.openapi({
		description:
			"Current transient progress phase while a clarification step is being prepared.",
		example: "planning_questions",
	});

export const conversationClarificationProgressSchema = z.object({
	phase: conversationClarificationProgressPhaseSchema,
	label: z.string(),
	detail: z.string().nullable(),
	attempt: z.number().int().min(1).nullable(),
	toolName: z.string().nullable(),
	startedAt: apiTimestampSchema,
});

export const conversationClarificationSummarySchema = z.object({
	requestId: z.ulid(),
	status: activeConversationKnowledgeClarificationStatusSchema,
	topicSummary: z.string(),
	engagementMode: knowledgeClarificationEngagementModeSchema,
	linkedConversationCount: z.number().int().min(0),
	question: z.string().nullable(),
	currentSuggestedAnswers:
		knowledgeClarificationSuggestedAnswersSchema.nullable(),
	currentQuestionInputMode:
		knowledgeClarificationQuestionInputModeSchema.nullable(),
	currentQuestionScope: knowledgeClarificationQuestionScopeSchema.nullable(),
	stepIndex: z.number().int().min(0),
	maxSteps: z.number().int().min(1),
	updatedAt: apiTimestampSchema,
	progress: conversationClarificationProgressSchema.nullable(),
});

export const knowledgeClarificationRequestSchema = z.object({
	id: z.ulid(),
	organizationId: z.ulid(),
	websiteId: z.ulid(),
	aiAgentId: z.ulid(),
	conversationId: z.string().nullable(),
	source: knowledgeClarificationSourceSchema,
	status: knowledgeClarificationStatusSchema,
	topicSummary: z.string(),
	engagementMode: knowledgeClarificationEngagementModeSchema,
	linkedConversationCount: z.number().int().min(0),
	stepIndex: z.number().int().min(0),
	maxSteps: z.number().int().min(1),
	targetKnowledgeId: z.ulid().nullable(),
	targetKnowledgeSummary:
		knowledgeClarificationTargetKnowledgeSummarySchema.nullable(),
	questionPlan: knowledgeClarificationQuestionPlanSchema.nullable().optional(),
	currentQuestion: z.string().nullable(),
	currentSuggestedAnswers:
		knowledgeClarificationSuggestedAnswersSchema.nullable(),
	currentQuestionInputMode:
		knowledgeClarificationQuestionInputModeSchema.nullable(),
	currentQuestionScope: knowledgeClarificationQuestionScopeSchema.nullable(),
	draftFaqPayload: knowledgeClarificationDraftFaqSchema.nullable(),
	lastError: z.string().nullable(),
	createdAt: apiTimestampSchema,
	updatedAt: apiTimestampSchema,
});

export const knowledgeClarificationTurnSchema = z.object({
	id: z.ulid(),
	requestId: z.ulid(),
	role: knowledgeClarificationTurnRoleSchema,
	question: z.string().nullable(),
	suggestedAnswers: knowledgeClarificationSuggestedAnswersSchema.nullable(),
	selectedAnswer: z.string().nullable(),
	freeAnswer: z.string().nullable(),
	createdAt: apiTimestampSchema,
	updatedAt: apiTimestampSchema,
});

export const knowledgeClarificationQuestionStepSchema = z.object({
	kind: z.literal("question"),
	request: knowledgeClarificationRequestSchema,
	question: z.string(),
	suggestedAnswers: knowledgeClarificationSuggestedAnswersSchema,
	inputMode: knowledgeClarificationQuestionInputModeSchema,
	questionScope: knowledgeClarificationQuestionScopeSchema,
});

export const knowledgeClarificationDraftStepSchema = z.object({
	kind: z.literal("draft_ready"),
	request: knowledgeClarificationRequestSchema,
	draftFaqPayload: knowledgeClarificationDraftFaqSchema,
});

export const knowledgeClarificationRetryRequiredStepSchema = z.object({
	kind: z.literal("retry_required"),
	request: knowledgeClarificationRequestSchema,
});

export const knowledgeClarificationStepResponseSchema = z.union([
	knowledgeClarificationQuestionStepSchema,
	knowledgeClarificationRetryRequiredStepSchema,
	knowledgeClarificationDraftStepSchema,
]);

export const getActiveKnowledgeClarificationRequestSchema = z.object({
	websiteSlug: z.string(),
	conversationId: z.string(),
});

export const startConversationKnowledgeClarificationRequestSchema = z.object({
	websiteSlug: z.string(),
	conversationId: z.string(),
	topicSummary: z.string().min(1).max(1000),
});

export const startFaqKnowledgeClarificationRequestSchema = z.object({
	websiteSlug: z.string(),
	knowledgeId: z.ulid(),
	topicSummary: z.string().min(1).max(1000).optional(),
});

export const answerKnowledgeClarificationRequestSchema = z
	.object({
		websiteSlug: z.string(),
		requestId: z.ulid(),
		expectedStepIndex: z.number().int().positive(),
		selectedAnswer: z.string().min(1).optional(),
		freeAnswer: z.string().min(1).optional(),
	})
	.refine(
		(input) =>
			Boolean(input.selectedAnswer?.trim()) !==
			Boolean(input.freeAnswer?.trim()),
		{
			message: "Provide either a selected answer or a free answer.",
			path: ["selectedAnswer"],
		}
	);

export const updateKnowledgeClarificationStatusRequestSchema = z.object({
	websiteSlug: z.string(),
	requestId: z.ulid(),
});

export const skipKnowledgeClarificationRequestSchema = z.object({
	websiteSlug: z.string(),
	requestId: z.ulid(),
	expectedStepIndex: z.number().int().positive(),
});

export const knowledgeClarificationStreamStepRequestSchema =
	z.discriminatedUnion("action", [
		startConversationKnowledgeClarificationRequestSchema.extend({
			action: z.literal("start_conversation"),
		}),
		startFaqKnowledgeClarificationRequestSchema.extend({
			action: z.literal("start_faq"),
		}),
		answerKnowledgeClarificationRequestSchema.extend({
			action: z.literal("answer"),
		}),
		skipKnowledgeClarificationRequestSchema.extend({
			action: z.literal("skip"),
		}),
		updateKnowledgeClarificationStatusRequestSchema.extend({
			action: z.literal("retry"),
		}),
	]);

export const knowledgeClarificationStreamStepDecisionSchema = z.object({
	kind: z.enum(["question", "draft_ready", "retry_required"]),
	topicSummary: z.string(),
	questionPlan: knowledgeClarificationQuestionPlanSchema.nullable(),
	question: z.string().nullable(),
	suggestedAnswers: knowledgeClarificationSuggestedAnswersSchema.nullable(),
	inputMode: knowledgeClarificationQuestionInputModeSchema.nullable(),
	questionScope: knowledgeClarificationQuestionScopeSchema.nullable(),
	draftFaqPayload: knowledgeClarificationDraftFaqSchema.nullable(),
	lastError: z.string().nullable(),
});

export const knowledgeClarificationStreamStepResponseSchema = z.object({
	requestId: z.ulid(),
	decision: knowledgeClarificationStreamStepDecisionSchema,
	status: z.union([
		z.literal("analyzing"),
		z.literal("awaiting_answer"),
		z.literal("retry_required"),
		z.literal("draft_ready"),
	]),
	updatedAt: apiTimestampSchema,
	request: knowledgeClarificationRequestSchema,
});

export const listKnowledgeClarificationProposalsRequestSchema = z.object({
	websiteSlug: z.string(),
});

export const listKnowledgeClarificationProposalsResponseSchema = z.object({
	items: z.array(knowledgeClarificationRequestSchema),
});

export const getKnowledgeClarificationProposalRequestSchema = z.object({
	websiteSlug: z.string(),
	requestId: z.ulid(),
});

export const getKnowledgeClarificationProposalResponseSchema = z.object({
	request: knowledgeClarificationRequestSchema.nullable(),
});

export const approveKnowledgeClarificationDraftRequestSchema = z.object({
	websiteSlug: z.string(),
	requestId: z.ulid(),
	draft: knowledgeClarificationDraftFaqSchema,
});

export const approveKnowledgeClarificationDraftResponseSchema = z.object({
	request: knowledgeClarificationRequestSchema,
	knowledge: knowledgeResponseSchema,
});

export const getActiveKnowledgeClarificationResponseSchema = z.object({
	request: knowledgeClarificationRequestSchema.nullable(),
});

export type KnowledgeClarificationSource = z.infer<
	typeof knowledgeClarificationSourceSchema
>;
export type ActiveConversationKnowledgeClarificationStatus = z.infer<
	typeof activeConversationKnowledgeClarificationStatusSchema
>;
export type ConversationClarificationProgressPhase = z.infer<
	typeof conversationClarificationProgressPhaseSchema
>;
export type ConversationClarificationProgress = z.infer<
	typeof conversationClarificationProgressSchema
>;
export type KnowledgeClarificationStatus = z.infer<
	typeof knowledgeClarificationStatusSchema
>;
export type ConversationClarificationSummary = z.infer<
	typeof conversationClarificationSummarySchema
>;
export type KnowledgeClarificationTurnRole = z.infer<
	typeof knowledgeClarificationTurnRoleSchema
>;
export type KnowledgeClarificationQuestionInputMode = z.infer<
	typeof knowledgeClarificationQuestionInputModeSchema
>;
export type KnowledgeClarificationQuestionScope = z.infer<
	typeof knowledgeClarificationQuestionScopeSchema
>;
export type KnowledgeClarificationPlannedQuestion = z.infer<
	typeof knowledgeClarificationPlannedQuestionSchema
>;
export type KnowledgeClarificationQuestionPlan = z.infer<
	typeof knowledgeClarificationQuestionPlanSchema
>;
export type KnowledgeClarificationDraftFaq = z.infer<
	typeof knowledgeClarificationDraftFaqSchema
>;
export type KnowledgeClarificationRequest = z.infer<
	typeof knowledgeClarificationRequestSchema
>;
export type KnowledgeClarificationTurn = z.infer<
	typeof knowledgeClarificationTurnSchema
>;
export type KnowledgeClarificationStepResponse = z.infer<
	typeof knowledgeClarificationStepResponseSchema
>;
export type KnowledgeClarificationStreamStepDecision = z.infer<
	typeof knowledgeClarificationStreamStepDecisionSchema
>;
export type KnowledgeClarificationStreamStepRequest = z.infer<
	typeof knowledgeClarificationStreamStepRequestSchema
>;
export type KnowledgeClarificationStreamStepResponse = z.infer<
	typeof knowledgeClarificationStreamStepResponseSchema
>;
export type StartConversationKnowledgeClarificationRequest = z.infer<
	typeof startConversationKnowledgeClarificationRequestSchema
>;
export type StartFaqKnowledgeClarificationRequest = z.infer<
	typeof startFaqKnowledgeClarificationRequestSchema
>;
export type AnswerKnowledgeClarificationRequest = z.infer<
	typeof answerKnowledgeClarificationRequestSchema
>;
export type SkipKnowledgeClarificationRequest = z.infer<
	typeof skipKnowledgeClarificationRequestSchema
>;
export type GetKnowledgeClarificationProposalRequest = z.infer<
	typeof getKnowledgeClarificationProposalRequestSchema
>;
export type GetKnowledgeClarificationProposalResponse = z.infer<
	typeof getKnowledgeClarificationProposalResponseSchema
>;
export type ApproveKnowledgeClarificationDraftRequest = z.infer<
	typeof approveKnowledgeClarificationDraftRequestSchema
>;
export type ApproveKnowledgeClarificationDraftResponse = z.infer<
	typeof approveKnowledgeClarificationDraftResponseSchema
>;
