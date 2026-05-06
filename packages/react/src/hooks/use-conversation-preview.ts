import {
	getTimelineItemFeedback,
	resolveConversationTitle,
	resolveTimelineItemText,
} from "@cossistant/core";
import { formatMessagePreview } from "@cossistant/tiny-markdown/utils";
import type { Conversation } from "@cossistant/types";
import type { TimelineItem } from "@cossistant/types/api/timeline-item";
import { useMemo } from "react";

import { useSupport } from "../provider";
import { useSupportText } from "../support/text";
import { resolveSupportHumanAgentDisplay } from "../support/utils/human-agent-display";
import { formatTimeAgo } from "../support/utils/time";
import {
	filterWidgetVisibleTypingEntries,
	mapTypingEntriesToPreviewParticipants,
	type PreviewTypingParticipant,
} from "./private/typing";
import { useConversationTimelineItems } from "./use-conversation-timeline-items";
import { useConversationTyping } from "./use-conversation-typing";

export type ConversationPreviewLastMessage = {
	content: string;
	time: string;
	isFromVisitor: boolean;
	isFeedbackReview?: boolean;
	senderName?: string;
	senderImage?: string | null;
};

export type ConversationPreviewAssignedAgent = {
	name: string;
	image: string | null;
	facehashName?: string;
	/** @deprecated Use facehashName. */
	facehashSeed?: string;
	type: "human" | "ai" | "fallback";
	/** Last seen timestamp for human agents, used for online status indicator */
	lastSeenAt?: string | null;
};

export type ConversationPreviewTypingParticipant = PreviewTypingParticipant;

export type ConversationPreviewTypingState = {
	participants: ConversationPreviewTypingParticipant[];
	primaryParticipant: ConversationPreviewTypingParticipant | null;
	label: string | null;
	isTyping: boolean;
};

export type UseConversationPreviewOptions = {
	conversation: Conversation;
	/**
	 * Whether the hook should fetch timeline items for the conversation.
	 * Disabled by default to reduce API calls - conversation.lastTimelineItem
	 * is typically sufficient for previews.
	 */
	includeTimelineItems?: boolean;
	/**
	 * Optional timeline items to merge with the live ones (e.g. optimistic items).
	 */
	initialTimelineItems?: TimelineItem[];
	/**
	 * Typing state configuration (mainly exclusions for the current visitor).
	 */
	typing?: {
		excludeVisitorId?: string | null;
		excludeUserId?: string | null;
		excludeAiAgentId?: string | null;
	};
};

export type UseConversationPreviewReturn = {
	conversation: Conversation;
	title: string;
	lastMessage: ConversationPreviewLastMessage | null;
	assignedAgent: ConversationPreviewAssignedAgent;
	typing: ConversationPreviewTypingState;
	timeline: ReturnType<typeof useConversationTimelineItems>;
};

function resolveLastTimelineMessage(
	items: TimelineItem[],
	fallback: TimelineItem | null
) {
	for (let index = items.length - 1; index >= 0; index--) {
		const item = items[index];

		if (item?.type === "message") {
			return item;
		}
	}

	if (fallback?.type === "message") {
		return fallback;
	}

	return null;
}

/**
 * Composes conversation metadata including derived titles, last message
 * snippets and typing state for use in lists.
 */
export function useConversationPreview(
	options: UseConversationPreviewOptions
): UseConversationPreviewReturn {
	const {
		conversation,
		includeTimelineItems = false,
		initialTimelineItems = [],
		typing,
	} = options;
	const { availableHumanAgents, availableAIAgents, visitor } = useSupport();
	const text = useSupportText();

	const timeline = useConversationTimelineItems(conversation.id, {
		enabled: includeTimelineItems,
	});

	const mergedTimelineItems = useMemo(() => {
		if (timeline.items.length > 0) {
			return timeline.items;
		}

		if (initialTimelineItems.length > 0) {
			return initialTimelineItems;
		}

		return [] as TimelineItem[];
	}, [timeline.items, initialTimelineItems]);

	const knownTimelineItems = useMemo(() => {
		const items = [...mergedTimelineItems];

		if (
			conversation.lastTimelineItem &&
			!items.some((item) => item.id === conversation.lastTimelineItem?.id)
		) {
			items.push(conversation.lastTimelineItem);
		}

		return items;
	}, [mergedTimelineItems, conversation.lastTimelineItem]);

	const lastTimelineMessage = useMemo(
		() =>
			resolveLastTimelineMessage(
				mergedTimelineItems,
				conversation.lastTimelineItem ?? null
			),
		[mergedTimelineItems, conversation.lastTimelineItem]
	);

	const lastMessage = useMemo<ConversationPreviewLastMessage | null>(() => {
		if (!lastTimelineMessage) {
			return null;
		}

		const isFromVisitor = lastTimelineMessage.visitorId !== null;
		const feedback = getTimelineItemFeedback(lastTimelineMessage);

		let senderName = text("common.fallbacks.unknown");
		let senderImage: string | null = null;

		if (isFromVisitor) {
			senderName = text("common.fallbacks.you");
		} else if (lastTimelineMessage.userId) {
			const agent = availableHumanAgents.find(
				(a) => a.id === lastTimelineMessage.userId
			);
			if (agent) {
				senderName = resolveSupportHumanAgentDisplay(
					agent,
					text("common.fallbacks.supportTeam")
				).displayName;
				senderImage = agent.image;
			} else {
				senderName = text("common.fallbacks.supportTeam");
			}
		} else if (lastTimelineMessage.aiAgentId) {
			const aiAgent = availableAIAgents.find(
				(agent) => agent.id === lastTimelineMessage.aiAgentId
			);
			if (aiAgent) {
				senderName = aiAgent.name;
				senderImage = aiAgent.image;
			} else {
				senderName = text("common.fallbacks.aiAssistant");
			}
		} else {
			senderName = text("common.fallbacks.supportTeam");
		}

		return {
			content: formatMessagePreview(
				resolveTimelineItemText(lastTimelineMessage, "visitor") || ""
			),
			time: formatTimeAgo(lastTimelineMessage.createdAt),
			isFromVisitor,
			isFeedbackReview: Boolean(feedback),
			senderName,
			senderImage,
		};
	}, [lastTimelineMessage, availableHumanAgents, availableAIAgents, text]);

	const assignedAgent = useMemo<ConversationPreviewAssignedAgent>(() => {
		const supportFallbackName = text("common.fallbacks.supportTeam");
		const aiFallbackName = text("common.fallbacks.aiAssistant");

		const lastAgentItem = [...knownTimelineItems]
			.reverse()
			.find((item) => item.userId !== null || item.aiAgentId !== null);

		if (lastAgentItem?.userId) {
			const human = availableHumanAgents.find(
				(agent) => agent.id === lastAgentItem.userId
			);

			if (human) {
				const humanDisplay = resolveSupportHumanAgentDisplay(
					human,
					supportFallbackName
				);

				return {
					type: "human" as const,
					name: humanDisplay.displayName,
					facehashName: humanDisplay.facehashName,
					facehashSeed: humanDisplay.facehashName,
					image: human.image ?? null,
					lastSeenAt: human.lastSeenAt ?? null,
				};
			}

			const humanDisplay = resolveSupportHumanAgentDisplay(
				{ id: lastAgentItem.userId, email: null, name: null },
				supportFallbackName
			);

			return {
				type: "human" as const,
				name: humanDisplay.displayName,
				facehashName: humanDisplay.facehashName,
				facehashSeed: humanDisplay.facehashName,
				image: null,
				lastSeenAt: null,
			};
		}

		if (lastAgentItem?.aiAgentId) {
			const ai = availableAIAgents.find(
				(agent) => agent.id === lastAgentItem.aiAgentId
			);

			if (ai) {
				return {
					type: "ai" as const,
					name: ai.name,
					image: ai.image ?? null,
				};
			}

			return {
				type: "ai" as const,
				name: aiFallbackName,
				image: null,
			};
		}

		const fallbackHuman = availableHumanAgents[0];
		if (fallbackHuman) {
			const humanDisplay = resolveSupportHumanAgentDisplay(
				fallbackHuman,
				supportFallbackName
			);

			return {
				type: "human" as const,
				name: humanDisplay.displayName,
				facehashName: humanDisplay.facehashName,
				facehashSeed: humanDisplay.facehashName,
				image: fallbackHuman.image ?? null,
				lastSeenAt: fallbackHuman.lastSeenAt ?? null,
			};
		}

		const fallbackAi = availableAIAgents[0];
		if (fallbackAi) {
			return {
				type: "ai" as const,
				name: fallbackAi.name,
				image: fallbackAi.image ?? null,
			};
		}

		return {
			type: "fallback" as const,
			name: supportFallbackName,
			facehashName: supportFallbackName,
			facehashSeed: supportFallbackName,
			image: null,
		};
	}, [knownTimelineItems, availableHumanAgents, availableAIAgents, text]);

	const typingEntries = useConversationTyping(conversation.id, {
		excludeVisitorId: typing?.excludeVisitorId ?? visitor?.id ?? null,
		excludeUserId: typing?.excludeUserId ?? null,
		excludeAiAgentId: typing?.excludeAiAgentId ?? null,
	});
	const widgetVisibleTypingEntries = useMemo(
		() => filterWidgetVisibleTypingEntries(typingEntries),
		[typingEntries]
	);

	const typingParticipants = useMemo(
		() =>
			mapTypingEntriesToPreviewParticipants(widgetVisibleTypingEntries, {
				availableHumanAgents,
				availableAIAgents,
				text,
			}),
		[widgetVisibleTypingEntries, availableHumanAgents, availableAIAgents, text]
	);

	const primaryTypingParticipant = typingParticipants[0] ?? null;

	const typingLabel = useMemo(() => {
		if (!primaryTypingParticipant) {
			return null;
		}

		return text("component.conversationButtonLink.typing", {
			name: primaryTypingParticipant.name,
		});
	}, [primaryTypingParticipant, text]);

	const typingState: ConversationPreviewTypingState = useMemo(
		() => ({
			participants: typingParticipants,
			primaryParticipant: primaryTypingParticipant,
			label: typingLabel,
			isTyping: typingParticipants.length > 0,
		}),
		[typingParticipants, primaryTypingParticipant, typingLabel]
	);

	const title = useMemo(() => {
		const resolvedTitle = resolveConversationTitle(conversation, "visitor");
		if (resolvedTitle) {
			return resolvedTitle;
		}

		if (lastMessage?.content) {
			return lastMessage.content;
		}

		return text("component.conversationButtonLink.fallbackTitle");
	}, [conversation, lastMessage?.content, text]);

	return {
		conversation,
		title,
		lastMessage,
		assignedAgent,
		typing: typingState,
		timeline,
	};
}
