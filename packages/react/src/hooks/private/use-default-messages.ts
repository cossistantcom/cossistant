import { generateMessageId } from "@plasma/core";
import { type DefaultMessage, SenderType } from "@plasma/types";
import type { TimelineItem } from "@plasma/types/api/timeline-item";
import { useMemo, useRef } from "react";
import { useSupport } from "../../provider";

type UseDefaultMessagesParams = {
	conversationId: string;
};

type DefaultMessageSeed = {
	signature: string;
	id: string;
	createdAt: string;
};

function createDefaultMessageTimestamp(): string {
	return typeof window !== "undefined" ? new Date().toISOString() : "";
}

function createDefaultMessageSignature(message: DefaultMessage): string {
	return `${message.senderType}:${message.senderId ?? ""}:${message.content}`;
}

export function reconcileDefaultMessageSeeds(
	defaultMessages: DefaultMessage[],
	previousSeeds: readonly DefaultMessageSeed[]
): DefaultMessageSeed[] {
	return defaultMessages.map((message, index) => {
		const signature = createDefaultMessageSignature(message);
		const previousSeed = previousSeeds[index];

		if (previousSeed?.signature === signature) {
			return previousSeed;
		}

		return {
			signature,
			id: generateMessageId(),
			createdAt: createDefaultMessageTimestamp(),
		} satisfies DefaultMessageSeed;
	});
}

/**
 * Mirrors the provider-configured default messages into timeline items so
 * that welcome content renders immediately while the backend conversation is
 * still being created. Agent fallbacks are resolved against available humans
 * and AI agents exposed by the provider context.
 */
export function useDefaultMessages({
	conversationId,
}: UseDefaultMessagesParams): TimelineItem[] {
	const { defaultMessages, availableAIAgents, availableHumanAgents } =
		useSupport();
	const defaultMessageSeedsRef = useRef<DefaultMessageSeed[]>([]);

	const memoisedDefaultTimelineItems = useMemo(() => {
		const nextSeeds = reconcileDefaultMessageSeeds(
			defaultMessages,
			defaultMessageSeedsRef.current
		);
		defaultMessageSeedsRef.current = nextSeeds;

		return defaultMessages.map((message, index) => {
			const seed = nextSeeds[index];
			return {
				id: seed?.id ?? generateMessageId(),
				conversationId,
				organizationId: "", // Not available for default messages
				type: "message" as const,
				text: message.content,
				parts: [{ type: "text" as const, text: message.content }],
				visibility: "public" as const,
				userId:
					message.senderType === SenderType.TEAM_MEMBER
						? message.senderId || availableHumanAgents[0]?.id || null
						: null,
				aiAgentId:
					message.senderType === SenderType.AI
						? message.senderId || availableAIAgents[0]?.id || null
						: null,
				visitorId:
					message.senderType === SenderType.VISITOR
						? message.senderId || null
						: null,
				createdAt: seed?.createdAt ?? createDefaultMessageTimestamp(),
				deletedAt: null,
			} satisfies TimelineItem;
		});
	}, [
		defaultMessages,
		availableHumanAgents[0]?.id,
		availableAIAgents[0]?.id,
		conversationId,
	]);

	return memoisedDefaultTimelineItems;
}
