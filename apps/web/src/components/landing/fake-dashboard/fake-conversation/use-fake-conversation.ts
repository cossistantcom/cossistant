import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MessageVisibility } from "@/components/conversation/composer";
import {
	DEMO_DELETE_ACCOUNT_FAQ_ANSWER,
	DEMO_DELETE_ACCOUNT_FAQ_TITLE,
	DEMO_DELETE_ACCOUNT_QUESTION,
	DEMO_DELETE_ACCOUNT_SEARCH_QUERY,
	DEMO_DELETE_ACCOUNT_SEARCH_TEXT,
} from "@/components/demo/demo-copy";
import type { ConversationTimelineItem } from "@/data/conversation-message-cache";
import { useAnimationScheduler } from "@/hooks/use-animation-scheduler";
import {
	ANTHONY_RIERA_ID,
	createMarcEscalatedConversation,
	createPieterDeleteAccountAnsweredConversation,
	type FakeConversationHandledPayload,
	type FakeDashboardScenarioId,
	type FakeTypingActor,
	fakeAIAgent,
	MARC_CONVERSATION_ID,
	MARC_VISITOR_ID,
	marcVisitor,
	PIETER_VISITOR_ID,
	pieterVisitor,
} from "../data";

const CONVERSATION_ID = MARC_CONVERSATION_ID;
const WORKFLOW_RUN_ID = "01JGWF222222222222222222";
const AI_ESCALATION_MESSAGE_ID = "01JGTIM22222222222222225";
const VISITOR_MESSAGE_ID = "01JGTIM22222222222222222";
const TOOL_SEARCH_RESULT_ID = "01JGTOOL22222222222222221";
const TOOL_TITLE_RESULT_ID = "01JGTOOL22222222222222223";
const PARTICIPANT_JOINED_EVENT_ID = "01JGEVE22222222222222230";
const HUMAN_REPLY_MESSAGE_ID = "01JGTIM22222222222222231";
const VISITOR_CONFIRM_MESSAGE_ID = "01JGTIM22222222222222232";
const MARC_UPDATED_TITLE = "Custom domain blocked by stale edge allowlist";
const PROMO_TOOL_SEARCH_ID = "01JGVIDEO22222222222222222";
const PROMO_AI_REPLY_MESSAGE_ID = "01JGVIDEO22222222222222223";
const PROMO_KNOWLEDGE_BASE_SOURCE_URL =
	"https://docs.cossistant.dev/account/delete-your-account";

export const FAKE_CONVERSATION_HUMAN_REPLY_TEXT =
	"I joined and deployed the allowlist patch to production. Please hard refresh and run a checkout test. I'll stay here while you verify.";
export const FAKE_CONVERSATION_HUMAN_TYPING_START_AT = 5400;
export const FAKE_CONVERSATION_HUMAN_REPLY_COMMIT_AT = 7600;
export const FAKE_CONVERSATION_VISITOR_TYPING_START_AT = 10_700;
const VISITOR_TYPING_CONFIRM_TEXT =
	"Perfect, I just refreshed in production and checkout events are flowing again.";

type UseFakeConversationProps = {
	isPlaying: boolean;
	onComplete?: () => void;
	onConversationHandled?: (payload: FakeConversationHandledPayload) => void;
	onShowJoinCursor?: () => void;
	scenario?: FakeDashboardScenarioId;
};

function createMessage(params: {
	id: string;
	text: string;
	userId: string | null;
	visitorId: string | null;
	aiAgentId: string | null;
	timestamp: Date;
}): ConversationTimelineItem {
	return {
		id: params.id,
		conversationId: CONVERSATION_ID,
		organizationId: "01JGORG11111111111111111",
		visibility: "public",
		type: "message",
		text: params.text,
		parts: [{ type: "text", text: params.text }],
		userId: params.userId,
		visitorId: params.visitorId,
		aiAgentId: params.aiAgentId,
		createdAt: params.timestamp.toISOString(),
		deletedAt: null,
	};
}

function createToolTimelineItem(params: {
	id: string;
	text: string;
	toolName: "searchKnowledgeBase" | "updateConversationTitle";
	input: Record<string, unknown>;
	state: "partial" | "result";
	output?: unknown;
	timestamp: Date;
}): ConversationTimelineItem {
	return {
		id: params.id,
		conversationId: CONVERSATION_ID,
		organizationId: "01JGORG11111111111111111",
		visibility: "public",
		type: "tool",
		text: params.text,
		parts: [
			{
				type: `tool-${params.toolName}`,
				toolCallId: `${params.id}-call`,
				toolName: params.toolName,
				input: params.input,
				state: params.state,
				output: params.output,
				callProviderMetadata: {
					cossistant: {
						toolTimeline: {
							logType: "customer_facing",
							triggerMessageId: VISITOR_MESSAGE_ID,
							workflowRunId: WORKFLOW_RUN_ID,
							triggerVisibility: "public",
						},
					},
				},
				providerMetadata: {
					cossistant: {
						toolTimeline: {
							logType: "customer_facing",
							triggerMessageId: VISITOR_MESSAGE_ID,
							workflowRunId: WORKFLOW_RUN_ID,
							triggerVisibility: "public",
						},
					},
				},
			},
		],
		userId: null,
		visitorId: null,
		aiAgentId: fakeAIAgent.id,
		createdAt: params.timestamp.toISOString(),
		deletedAt: null,
	};
}

function createParticipantJoinedEvent(
	timestamp: Date
): ConversationTimelineItem {
	return {
		id: PARTICIPANT_JOINED_EVENT_ID,
		conversationId: CONVERSATION_ID,
		organizationId: "01JGORG11111111111111111",
		visibility: "public",
		type: "event",
		text: null,
		parts: [
			{
				type: "event",
				eventType: "participant_joined",
				actorUserId: ANTHONY_RIERA_ID,
				actorAiAgentId: null,
				targetUserId: null,
				targetAiAgentId: null,
				message: null,
			},
		],
		userId: null,
		visitorId: null,
		aiAgentId: null,
		createdAt: timestamp.toISOString(),
		deletedAt: null,
	};
}

export function createTypingPreview(
	fullText: string,
	revealedCharacters: number
): string {
	return fullText.slice(0, Math.max(0, revealedCharacters));
}

export function getFakeConversationHumanReplyState(atMs: number) {
	if (atMs < FAKE_CONVERSATION_HUMAN_TYPING_START_AT) {
		return {
			composerValue: "",
			hasCommittedMessage: false,
			isComposerTyping: false,
			showsPlaceholder: true,
		};
	}

	if (atMs < FAKE_CONVERSATION_HUMAN_REPLY_COMMIT_AT) {
		return {
			composerValue: FAKE_CONVERSATION_HUMAN_REPLY_TEXT,
			hasCommittedMessage: false,
			isComposerTyping: true,
			showsPlaceholder: false,
		};
	}

	return {
		composerValue: "",
		hasCommittedMessage: true,
		isComposerTyping: false,
		showsPlaceholder: true,
	};
}

export function isFakeConversationEscalationPendingByScenario(
	scenario: FakeDashboardScenarioId
) {
	return scenario === "landing_escalation";
}

function createLandingInitialTimeline(now: number): ConversationTimelineItem[] {
	const visitorMessageTime = new Date(now - 7 * 60 * 1000);
	const searchResultTime = new Date(now - 6 * 60 * 1000 + 40 * 1000);
	const titleResultTime = new Date(now - 5 * 60 * 1000 + 28 * 1000);
	const escalationTime = new Date(now - 4 * 60 * 1000 + 5 * 1000);

	return [
		createMessage({
			id: VISITOR_MESSAGE_ID,
			text: "Hey team, our production widget on billing.acme.dev is still blocked after DNS verify.",
			userId: null,
			visitorId: MARC_VISITOR_ID,
			aiAgentId: null,
			timestamp: visitorMessageTime,
		}),
		createToolTimelineItem({
			id: TOOL_SEARCH_RESULT_ID,
			text: "Found 3 sources",
			toolName: "searchKnowledgeBase",
			input: {
				query:
					"custom domain widget blocked allowlist stale edge cache after DNS verify",
			},
			state: "result",
			output: {
				success: true,
				data: {
					totalFound: 3,
					articles: [
						{
							title: "Custom Domain Allowlist Rollout Checklist",
							sourceUrl:
								"https://docs.plasma-pandora.dev/runbooks/custom-domain-allowlist",
						},
						{
							title: "Edge Cache Propagation Troubleshooting",
							sourceUrl:
								"https://docs.plasma-pandora.dev/runbooks/edge-cache-propagation",
						},
						{
							title: "Webhook Retry Safety for Billing Flows",
							sourceUrl:
								"https://docs.plasma-pandora.dev/runbooks/webhook-retry-safety",
						},
					],
				},
			},
			timestamp: searchResultTime,
		}),
		createToolTimelineItem({
			id: TOOL_TITLE_RESULT_ID,
			text: `Updated the title to "${MARC_UPDATED_TITLE}"`,
			toolName: "updateConversationTitle",
			input: { title: MARC_UPDATED_TITLE },
			state: "result",
			output: {
				success: true,
				data: { title: MARC_UPDATED_TITLE },
			},
			timestamp: titleResultTime,
		}),
		createMessage({
			id: AI_ESCALATION_MESSAGE_ID,
			text: "I traced it to a stale production allowlist and prepared a safe patch. I need a human teammate to deploy and verify in production. Please join the conversation.",
			userId: null,
			visitorId: null,
			aiAgentId: fakeAIAgent.id,
			timestamp: escalationTime,
		}),
	];
}

export function createPromoDeleteAccountAnsweredTimeline(
	now: number
): [
	ConversationTimelineItem,
	ConversationTimelineItem,
	ConversationTimelineItem,
	ConversationTimelineItem,
] {
	const visitorMessageTime = new Date(now - 70 * 1000);
	const searchPartialTime = new Date(now - 64 * 1000);
	const searchResultTime = new Date(now - 62 * 1000);
	const aiAnswerTime = new Date(now - 58 * 1000);

	return [
		createMessage({
			id: VISITOR_MESSAGE_ID,
			text: DEMO_DELETE_ACCOUNT_QUESTION,
			userId: null,
			visitorId: PIETER_VISITOR_ID,
			aiAgentId: null,
			timestamp: visitorMessageTime,
		}),
		createToolTimelineItem({
			id: PROMO_TOOL_SEARCH_ID,
			text: DEMO_DELETE_ACCOUNT_SEARCH_TEXT,
			toolName: "searchKnowledgeBase",
			input: {
				query: DEMO_DELETE_ACCOUNT_SEARCH_QUERY,
			},
			state: "partial",
			timestamp: searchPartialTime,
		}),
		createToolTimelineItem({
			id: PROMO_TOOL_SEARCH_ID,
			text: "Found 1 source",
			toolName: "searchKnowledgeBase",
			input: {
				query: DEMO_DELETE_ACCOUNT_SEARCH_QUERY,
			},
			state: "result",
			output: {
				success: true,
				data: {
					totalFound: 1,
					articles: [
						{
							title: DEMO_DELETE_ACCOUNT_FAQ_TITLE,
							sourceUrl: PROMO_KNOWLEDGE_BASE_SOURCE_URL,
						},
					],
				},
			},
			timestamp: searchResultTime,
		}),
		createMessage({
			id: PROMO_AI_REPLY_MESSAGE_ID,
			text: DEMO_DELETE_ACCOUNT_FAQ_ANSWER,
			userId: null,
			visitorId: null,
			aiAgentId: fakeAIAgent.id,
			timestamp: aiAnswerTime,
		}),
	];
}

function getConversationForScenario(scenario: FakeDashboardScenarioId) {
	if (scenario === "promo_delete_account_answered") {
		return createPieterDeleteAccountAnsweredConversation();
	}

	return createMarcEscalatedConversation();
}

export function useFakeConversation({
	isPlaying,
	onComplete,
	onConversationHandled,
	onShowJoinCursor,
	scenario = "landing_escalation",
}: UseFakeConversationProps) {
	const conversation = useMemo(
		() => getConversationForScenario(scenario),
		[scenario]
	);
	const startsEscalated =
		isFakeConversationEscalationPendingByScenario(scenario);
	const [timelineItems, setTimelineItems] = useState<
		ConversationTimelineItem[]
	>([]);
	const [typingActors, setTypingActors] = useState<FakeTypingActor[]>([]);
	const [isEscalationPending, setIsEscalationPending] =
		useState(startsEscalated);
	const [composerValue, setComposerValue] = useState("");
	const [composerVisibility, setComposerVisibility] =
		useState<MessageVisibility>("public");
	const [isComposerTyping, setIsComposerTyping] = useState(false);
	const hasScheduledRef = useRef(false);
	const hasJoinedRef = useRef(false);
	const hasHandledRef = useRef(false);
	const hasInitializedRef = useRef(false);
	const visitorConfirmationMessageRef = useRef<ConversationTimelineItem | null>(
		null
	);
	const scheduleRef = useRef<
		((timeMs: number, callback: () => void) => () => void) | null
	>(null);
	const onConversationHandledRef = useRef(onConversationHandled);
	const onShowJoinCursorRef = useRef(onShowJoinCursor);

	useEffect(() => {
		onConversationHandledRef.current = onConversationHandled;
	}, [onConversationHandled]);

	useEffect(() => {
		onShowJoinCursorRef.current = onShowJoinCursor;
	}, [onShowJoinCursor]);

	const { schedule, reset: resetScheduler } = useAnimationScheduler({
		isPlaying,
		onComplete,
	});

	scheduleRef.current = schedule;
	useEffect(() => {
		scheduleRef.current = schedule;
	}, [schedule]);

	const appendTimelineItems = useCallback(
		(newItems: ConversationTimelineItem | ConversationTimelineItem[]) => {
			const itemsArray = Array.isArray(newItems) ? newItems : [newItems];
			if (itemsArray.length === 0) {
				return;
			}

			setTimelineItems((prev) => {
				const nextItems = [...prev];

				for (const item of itemsArray) {
					const existingIndex = nextItems.findIndex(
						(existingItem) => existingItem.id === item.id
					);

					if (existingIndex === -1) {
						nextItems.push(item);
						continue;
					}

					nextItems[existingIndex] = item;
				}

				return nextItems;
			});
		},
		[]
	);

	const joinEscalation = useCallback(() => {
		if (scenario !== "landing_escalation" || hasJoinedRef.current) {
			return;
		}

		hasJoinedRef.current = true;
		setIsEscalationPending(false);
		setTypingActors([]);
		appendTimelineItems(createParticipantJoinedEvent(new Date()));
	}, [appendTimelineItems, scenario]);

	const resetDemoData = useCallback(() => {
		setTimelineItems([]);
		setTypingActors([]);
		setIsEscalationPending(startsEscalated);
		setComposerValue("");
		setComposerVisibility("public");
		setIsComposerTyping(false);
		resetScheduler();
		hasScheduledRef.current = false;
		hasJoinedRef.current = false;
		hasHandledRef.current = false;
		hasInitializedRef.current = false;
		visitorConfirmationMessageRef.current = null;
	}, [resetScheduler, startsEscalated]);

	useEffect(() => {
		if (!isPlaying || hasScheduledRef.current) {
			return;
		}

		const scheduleTasks = () => {
			const currentSchedule = scheduleRef.current;
			if (!currentSchedule) {
				setTimeout(scheduleTasks, 10);
				return;
			}

			hasScheduledRef.current = true;
			const now = Date.now();

			if (!hasInitializedRef.current) {
				if (scenario === "promo_delete_account_answered") {
					const promoTimeline = createPromoDeleteAccountAnsweredTimeline(now);
					setTimelineItems([promoTimeline[0]]);
					hasInitializedRef.current = true;

					currentSchedule(1450, () => {
						appendTimelineItems(promoTimeline[1]);
					});

					currentSchedule(3100, () => {
						appendTimelineItems(promoTimeline[2]);
					});

					currentSchedule(4700, () => {
						appendTimelineItems(promoTimeline[3]);
					});

					currentSchedule(6500, () => {});
					return;
				}

				setTimelineItems(createLandingInitialTimeline(now));
				hasInitializedRef.current = true;
			}

			currentSchedule(3900, () => {
				if (!hasJoinedRef.current) {
					onShowJoinCursorRef.current?.();
				}
			});

			currentSchedule(FAKE_CONVERSATION_HUMAN_TYPING_START_AT, () => {
				if (!hasJoinedRef.current) {
					return;
				}

				setComposerValue(FAKE_CONVERSATION_HUMAN_REPLY_TEXT);
				setIsComposerTyping(true);
			});

			currentSchedule(FAKE_CONVERSATION_HUMAN_REPLY_COMMIT_AT, () => {
				if (!hasJoinedRef.current) {
					return;
				}

				setIsComposerTyping(false);
				setComposerValue("");
				appendTimelineItems(
					createMessage({
						id: HUMAN_REPLY_MESSAGE_ID,
						text: FAKE_CONVERSATION_HUMAN_REPLY_TEXT,
						userId: ANTHONY_RIERA_ID,
						visitorId: null,
						aiAgentId: null,
						timestamp: new Date(),
					})
				);
			});

			const visitorTypingStartAt = FAKE_CONVERSATION_VISITOR_TYPING_START_AT;
			const visitorTypingDuration = 5200;
			const typingStepDuration =
				visitorTypingDuration / VISITOR_TYPING_CONFIRM_TEXT.length;

			currentSchedule(visitorTypingStartAt, () => {
				if (!hasJoinedRef.current) {
					return;
				}

				setTypingActors([
					{
						conversationId: CONVERSATION_ID,
						actorType: "visitor",
						actorId: MARC_VISITOR_ID,
						preview: "",
					},
				]);
			});

			for (
				let characterCount = 1;
				characterCount <= VISITOR_TYPING_CONFIRM_TEXT.length;
				characterCount += 1
			) {
				currentSchedule(
					visitorTypingStartAt + characterCount * typingStepDuration,
					() => {
						if (!hasJoinedRef.current) {
							return;
						}

						setTypingActors([
							{
								conversationId: CONVERSATION_ID,
								actorType: "visitor",
								actorId: MARC_VISITOR_ID,
								preview: createTypingPreview(
									VISITOR_TYPING_CONFIRM_TEXT,
									characterCount
								),
							},
						]);
					}
				);
			}

			currentSchedule(16_700, () => {
				if (!hasJoinedRef.current) {
					return;
				}

				setTypingActors([]);
				const visitorConfirmationMessage = createMessage({
					id: VISITOR_CONFIRM_MESSAGE_ID,
					text: "Perfect, it works again in production. Checkout and webhooks are both green now.",
					userId: null,
					visitorId: MARC_VISITOR_ID,
					aiAgentId: null,
					timestamp: new Date(),
				});
				visitorConfirmationMessageRef.current = visitorConfirmationMessage;
				appendTimelineItems(visitorConfirmationMessage);
			});

			currentSchedule(18_900, () => {
				if (!(hasJoinedRef.current && !hasHandledRef.current)) {
					return;
				}

				hasHandledRef.current = true;
				onConversationHandledRef.current?.({
					conversationId: CONVERSATION_ID,
					handledAt: new Date().toISOString(),
					lastTimelineItem:
						visitorConfirmationMessageRef.current ??
						createMessage({
							id: HUMAN_REPLY_MESSAGE_ID,
							text: FAKE_CONVERSATION_HUMAN_REPLY_TEXT,
							userId: ANTHONY_RIERA_ID,
							visitorId: null,
							aiAgentId: null,
							timestamp: new Date(),
						}),
					title: MARC_UPDATED_TITLE,
				});
			});

			currentSchedule(21_500, () => {});
		};

		scheduleTasks();
	}, [appendTimelineItems, isPlaying, scenario]);

	return {
		conversation,
		timelineItems,
		visitor:
			scenario === "promo_delete_account_answered"
				? pieterVisitor
				: marcVisitor,
		resetDemoData,
		typingActors,
		isEscalationPending,
		composerValue,
		composerVisibility,
		isComposerTyping,
		joinEscalation,
		onComposerVisibilityChange: setComposerVisibility,
	};
}
