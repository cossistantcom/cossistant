import type {
	KnowledgeClarificationDraftFaq,
	KnowledgeClarificationQuestionInputMode,
} from "@plasma/types";
import {
	DEMO_DELETE_ACCOUNT_FAQ_ANSWER,
	DEMO_DELETE_ACCOUNT_FAQ_TITLE,
	DEMO_DELETE_ACCOUNT_QUESTION,
	DEMO_DELETE_ACCOUNT_SEARCH_QUERY,
	DEMO_DELETE_ACCOUNT_SEARCH_TEXT,
} from "@/components/demo/demo-copy";
import {
	fakeAIAgent,
	MARC_VISITOR_ID,
} from "@/components/landing/fake-dashboard/data";
import type { ConversationTimelineItem } from "@/data/conversation-message-cache";

export type PrecisionFlowPhase =
	| "visitor_question"
	| "gap_search_loading"
	| "gap_search_result"
	| "human_handoff"
	| "clarify_transition"
	| "clarify_prompt"
	| "clarify_click"
	| "question_one"
	| "question_one_next_click"
	| "question_two"
	| "question_two_select"
	| "analyzing"
	| "draft_ready"
	| "approve_click"
	| "faq_created";

export type PrecisionFlowStepId =
	| "visitor_asks"
	| "ai_detects_gap"
	| "human_teaches_ai"
	| "faq_draft_ready";

export type PrecisionFlowQuestionState = {
	kind: "question";
	stepIndex: number;
	maxSteps: number;
	question: string;
	suggestedAnswers: string[];
	inputMode: KnowledgeClarificationQuestionInputMode;
	selectedAnswer: string | null;
	freeAnswer: string;
};

export type PrecisionFlowAnalyzingState = Omit<
	PrecisionFlowQuestionState,
	"kind"
> & {
	kind: "analyzing";
	message: string;
};

export type PrecisionFlowComposerState =
	| { kind: "default" }
	| { kind: "prompt" }
	| PrecisionFlowQuestionState
	| PrecisionFlowAnalyzingState
	| { kind: "draft_ready" };

export type PrecisionFlowScene = {
	activeStepId: PrecisionFlowStepId;
	topicSummary: string;
	timelineItems: ConversationTimelineItem[];
	composerState: PrecisionFlowComposerState;
	composerValue: string;
	faqDraft: KnowledgeClarificationDraftFaq;
	showClarifyCursor: boolean;
	showQuestionOneNextCursor: boolean;
	showAnswerSelectCursor: boolean;
	showApproveCursor: boolean;
};

export const PRECISION_FLOW_INITIAL_PHASE: PrecisionFlowPhase =
	"visitor_question";

export const PRECISION_FLOW_STEPS: Array<{
	id: PrecisionFlowStepId;
	label: string;
	description: string;
}> = [
	{
		id: "visitor_asks",
		label: "Customer asks",
		description: "A support question comes in.",
	},
	{
		id: "ai_detects_gap",
		label: "Cossistant checks",
		description: "It checks past answers first.",
	},
	{
		id: "human_teaches_ai",
		label: "Your team answers",
		description: "If it is missing, your team answers once.",
	},
	{
		id: "faq_draft_ready",
		label: "Next time, Cossistant knows",
		description: "The next time someone asks, it can answer.",
	},
];

export const PRECISION_FLOW_PHASE_SEQUENCE: Array<{
	phase: PrecisionFlowPhase;
	atMs: number;
}> = [
	{ phase: "gap_search_loading", atMs: 2800 },
	{ phase: "gap_search_result", atMs: 4700 },
	{ phase: "human_handoff", atMs: 6900 },
	{ phase: "clarify_transition", atMs: 8300 },
	{ phase: "clarify_prompt", atMs: 8800 },
	{ phase: "clarify_click", atMs: 9800 },
	{ phase: "question_one", atMs: 12_200 },
	{ phase: "question_one_next_click", atMs: 15_000 },
	{ phase: "question_two_select", atMs: 17_900 },
	{ phase: "analyzing", atMs: 19_900 },
	{ phase: "draft_ready", atMs: 22_300 },
	{ phase: "approve_click", atMs: 24_800 },
];

const PRECISION_FLOW_STEP_START_PHASES: Record<
	PrecisionFlowStepId,
	PrecisionFlowPhase
> = {
	visitor_asks: "visitor_question",
	ai_detects_gap: "gap_search_loading",
	human_teaches_ai: "clarify_prompt",
	faq_draft_ready: "draft_ready",
};

const PRECISION_FLOW_PHASE_TIMESTAMPS_MS: Partial<
	Record<PrecisionFlowPhase, number>
> = {
	visitor_question: 0,
	...Object.fromEntries(
		PRECISION_FLOW_PHASE_SEQUENCE.map(({ phase, atMs }) => [phase, atMs])
	),
};

export const PRECISION_FLOW_TYPED_QUESTION = DEMO_DELETE_ACCOUNT_QUESTION;
export const PRECISION_FLOW_TOPIC_SUMMARY =
	"Answer this once. Cossistant will use it next time.";
export const PRECISION_FLOW_ANALYZING_MESSAGE =
	"Saving this answer for next time...";
export const PRECISION_FLOW_QUESTION_ONE_ANSWER =
	"Delete it in Settings -> Account. We confirm by email and allow recovery for 30 days.";
export const PRECISION_FLOW_QUESTION_TWO_ANSWER =
	"Self-serve in Settings -> Account";
export const PRECISION_FLOW_FAQ_DRAFT: KnowledgeClarificationDraftFaq = {
	title: DEMO_DELETE_ACCOUNT_FAQ_TITLE,
	question: PRECISION_FLOW_TYPED_QUESTION,
	answer: DEMO_DELETE_ACCOUNT_FAQ_ANSWER,
	categories: ["Account"],
	relatedQuestions: [
		"Can I recover my account after deleting it?",
		"Where do I start the account deletion flow?",
	],
};

function createMessage(params: {
	id: string;
	text: string;
	userId: string | null;
	visitorId: string | null;
	aiAgentId: string | null;
	createdAt: string;
}): ConversationTimelineItem {
	return {
		id: params.id,
		conversationId: "01JGPRECISIONFLOWCONVERSATION",
		organizationId: "01JGORG11111111111111111",
		visibility: "public",
		type: "message",
		text: params.text,
		parts: [{ type: "text", text: params.text }],
		userId: params.userId,
		visitorId: params.visitorId,
		aiAgentId: params.aiAgentId,
		createdAt: params.createdAt,
		deletedAt: null,
	};
}

function createToolTimelineItem(params: {
	id: string;
	text: string;
	input: Record<string, unknown>;
	state: "partial" | "result";
	output?: unknown;
	createdAt: string;
}): ConversationTimelineItem {
	return {
		id: params.id,
		conversationId: "01JGPRECISIONFLOWCONVERSATION",
		organizationId: "01JGORG11111111111111111",
		visibility: "public",
		type: "tool",
		text: params.text,
		parts: [
			{
				type: "tool-searchKnowledgeBase",
				toolCallId: `${params.id}-call`,
				toolName: "searchKnowledgeBase",
				input: params.input,
				state: params.state,
				output: params.output,
				callProviderMetadata: {
					cossistant: {
						toolTimeline: {
							logType: "customer_facing",
							triggerMessageId: "01JGPRECISIONFLOWVISITORQUESTION",
							workflowRunId: "01JGPRECISIONFLOWWORKFLOW",
							triggerVisibility: "public",
						},
					},
				},
				providerMetadata: {
					cossistant: {
						toolTimeline: {
							logType: "customer_facing",
							triggerMessageId: "01JGPRECISIONFLOWVISITORQUESTION",
							workflowRunId: "01JGPRECISIONFLOWWORKFLOW",
							triggerVisibility: "public",
						},
					},
				},
			},
		],
		userId: null,
		visitorId: null,
		aiAgentId: fakeAIAgent.id,
		createdAt: params.createdAt,
		deletedAt: null,
	};
}

const PRECISION_FLOW_SEARCH_TOOL_ID = "01JGPRECISIONFLOWSEARCH";
const PRECISION_FLOW_SEARCH_TOOL_CREATED_AT = "2026-03-18T09:01:11.000Z";

const TIMELINE_ITEMS = {
	visitor_question: createMessage({
		id: "01JGPRECISIONFLOWVISITORQUESTION",
		text: PRECISION_FLOW_TYPED_QUESTION,
		userId: null,
		visitorId: MARC_VISITOR_ID,
		aiAgentId: null,
		createdAt: "2026-03-18T09:01:02.000Z",
	}),
	gap_search_loading: createToolTimelineItem({
		id: PRECISION_FLOW_SEARCH_TOOL_ID,
		text: DEMO_DELETE_ACCOUNT_SEARCH_TEXT,
		input: {
			query: DEMO_DELETE_ACCOUNT_SEARCH_QUERY,
		},
		state: "partial",
		createdAt: PRECISION_FLOW_SEARCH_TOOL_CREATED_AT,
	}),
	gap_search_result: createToolTimelineItem({
		id: PRECISION_FLOW_SEARCH_TOOL_ID,
		text: DEMO_DELETE_ACCOUNT_SEARCH_TEXT,
		input: {
			query: DEMO_DELETE_ACCOUNT_SEARCH_QUERY,
		},
		state: "result",
		output: {
			success: true,
			data: {
				totalFound: 0,
				articles: [],
			},
		},
		createdAt: PRECISION_FLOW_SEARCH_TOOL_CREATED_AT,
	}),
	handoff: createMessage({
		id: "01JGPRECISIONFLOWHANDOFF",
		text: "I don't know this one yet, so I'm asking the team and saving the answer for next time.",
		userId: null,
		visitorId: null,
		aiAgentId: fakeAIAgent.id,
		createdAt: "2026-03-18T09:01:30.000Z",
	}),
} satisfies Record<
	"visitor_question" | "gap_search_loading" | "gap_search_result" | "handoff",
	ConversationTimelineItem
>;

export function createPrecisionFlowPlaybackState() {
	return {
		phase: PRECISION_FLOW_INITIAL_PHASE,
	};
}

export function resetPrecisionFlowPlaybackState() {
	return createPrecisionFlowPlaybackState();
}

export function getPrecisionFlowStepId(
	phase: PrecisionFlowPhase
): PrecisionFlowStepId {
	if (phase === "visitor_question") {
		return "visitor_asks";
	}

	if (
		phase === "gap_search_loading" ||
		phase === "gap_search_result" ||
		phase === "human_handoff"
	) {
		return "ai_detects_gap";
	}

	if (
		phase === "clarify_transition" ||
		phase === "clarify_prompt" ||
		phase === "clarify_click" ||
		phase === "question_one" ||
		phase === "question_one_next_click" ||
		phase === "question_two" ||
		phase === "question_two_select" ||
		phase === "analyzing"
	) {
		return "human_teaches_ai";
	}

	return "faq_draft_ready";
}

export function getPrecisionFlowStartPhaseForStep(
	stepId: PrecisionFlowStepId
): PrecisionFlowPhase {
	return PRECISION_FLOW_STEP_START_PHASES[stepId];
}

export function getPrecisionFlowRemainingSequence(
	startPhase: PrecisionFlowPhase
) {
	const startAtMs = PRECISION_FLOW_PHASE_TIMESTAMPS_MS[startPhase] ?? 0;

	return PRECISION_FLOW_PHASE_SEQUENCE.filter(
		({ atMs }) => atMs > startAtMs
	).map((entry) => ({
		...entry,
		delayMs: entry.atMs - startAtMs,
	}));
}

export function buildPrecisionFlowScene(
	phase: PrecisionFlowPhase
): PrecisionFlowScene {
	const timelineItems: ConversationTimelineItem[] = [];

	if (
		phase === "visitor_question" ||
		phase === "gap_search_loading" ||
		phase === "gap_search_result" ||
		phase === "human_handoff" ||
		phase === "clarify_transition" ||
		phase === "clarify_prompt" ||
		phase === "clarify_click" ||
		phase === "question_one" ||
		phase === "question_one_next_click" ||
		phase === "question_two" ||
		phase === "question_two_select" ||
		phase === "analyzing" ||
		phase === "draft_ready" ||
		phase === "approve_click" ||
		phase === "faq_created"
	) {
		timelineItems.push(TIMELINE_ITEMS.visitor_question);
	}

	if (phase === "gap_search_loading") {
		timelineItems.push(TIMELINE_ITEMS.gap_search_loading);
	}

	if (
		phase === "gap_search_result" ||
		phase === "human_handoff" ||
		phase === "clarify_transition" ||
		phase === "clarify_prompt" ||
		phase === "clarify_click" ||
		phase === "question_one" ||
		phase === "question_one_next_click" ||
		phase === "question_two" ||
		phase === "question_two_select" ||
		phase === "analyzing" ||
		phase === "draft_ready" ||
		phase === "approve_click" ||
		phase === "faq_created"
	) {
		timelineItems.push(TIMELINE_ITEMS.gap_search_result);
	}

	if (
		phase === "human_handoff" ||
		phase === "clarify_transition" ||
		phase === "clarify_prompt" ||
		phase === "clarify_click" ||
		phase === "question_one" ||
		phase === "question_one_next_click" ||
		phase === "question_two" ||
		phase === "question_two_select" ||
		phase === "analyzing" ||
		phase === "draft_ready" ||
		phase === "approve_click" ||
		phase === "faq_created"
	) {
		timelineItems.push(TIMELINE_ITEMS.handoff);
	}

	let composerState: PrecisionFlowComposerState = { kind: "default" };

	if (
		phase === "clarify_transition" ||
		phase === "clarify_prompt" ||
		phase === "clarify_click"
	) {
		composerState = { kind: "prompt" };
	} else if (phase === "question_one" || phase === "question_one_next_click") {
		composerState = {
			kind: "question",
			stepIndex: 1,
			maxSteps: 2,
			question: "How does account deletion work today?",
			suggestedAnswers: [
				"We send a confirmation email first",
				"There is a recovery period before permanent deletion",
				"Deletion starts in account settings",
			],
			inputMode: "textarea_first",
			selectedAnswer: null,
			freeAnswer: PRECISION_FLOW_QUESTION_ONE_ANSWER,
		};
	} else if (phase === "question_two") {
		composerState = {
			kind: "question",
			stepIndex: 2,
			maxSteps: 2,
			question: "Where should the visitor go to start the deletion flow?",
			suggestedAnswers: [
				PRECISION_FLOW_QUESTION_TWO_ANSWER,
				"Only support can delete it manually",
				"Workspace owners must email the team",
			],
			inputMode: "suggested_answers",
			selectedAnswer: null,
			freeAnswer: "",
		};
	} else if (phase === "question_two_select") {
		composerState = {
			kind: "question",
			stepIndex: 2,
			maxSteps: 2,
			question: "Where should the visitor go to start the deletion flow?",
			suggestedAnswers: [
				PRECISION_FLOW_QUESTION_TWO_ANSWER,
				"Only support can delete it manually",
				"Workspace owners must email the team",
			],
			inputMode: "suggested_answers",
			selectedAnswer: null,
			freeAnswer: "",
		};
	} else if (phase === "analyzing") {
		composerState = {
			kind: "analyzing",
			message: PRECISION_FLOW_ANALYZING_MESSAGE,
			stepIndex: 2,
			maxSteps: 2,
			question: "Where should the visitor go to start the deletion flow?",
			suggestedAnswers: [
				PRECISION_FLOW_QUESTION_TWO_ANSWER,
				"Only support can delete it manually",
				"Workspace owners must email the team",
			],
			inputMode: "suggested_answers",
			selectedAnswer: PRECISION_FLOW_QUESTION_TWO_ANSWER,
			freeAnswer: "",
		};
	} else if (phase === "draft_ready" || phase === "approve_click") {
		composerState = { kind: "draft_ready" };
	}

	return {
		activeStepId: getPrecisionFlowStepId(phase),
		topicSummary: PRECISION_FLOW_TOPIC_SUMMARY,
		timelineItems,
		composerState,
		composerValue: "",
		faqDraft: PRECISION_FLOW_FAQ_DRAFT,
		showClarifyCursor: phase === "clarify_click",
		showQuestionOneNextCursor: phase === "question_one_next_click",
		showAnswerSelectCursor: phase === "question_two_select",
		showApproveCursor: phase === "approve_click",
	};
}
