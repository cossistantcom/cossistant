import { generateMessageId } from "@cossistant/core/utils";
import type { DefaultMessage } from "@cossistant/types";
import type { TimelineItem } from "@cossistant/types/api/timeline-item";
import { SenderType } from "@cossistant/types/enums";
import { useMemo, useRef, useSyncExternalStore } from "react";
import { useSupport } from "../../provider";

type UseDefaultMessagesParams = {
	conversationId: string;
};

type DefaultMessageSeed = {
	signature: string;
	id: string;
	createdAt: string;
};

const emptySubscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

function createDefaultMessageTimestamp(): string {
	return new Date().toISOString();
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
	// Seeds carry render-time ulids/timestamps that can never match between the
	// server and client passes; render nothing until hydration completes so
	// SSR HTML and the hydration render emit identical markup.
	const isHydrated = useSyncExternalStore(
		emptySubscribe,
		getClientSnapshot,
		getServerSnapshot
	);

	const memoisedDefaultTimelineItems = useMemo(() => {
		if (!isHydrated) {
			return [];
		}

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
		isHydrated,
		defaultMessages,
		availableHumanAgents[0]?.id,
		availableAIAgents[0]?.id,
		conversationId,
	]);

	return memoisedDefaultTimelineItems;
}
