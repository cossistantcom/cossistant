import type { ConversationHeader } from "@plasma/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAnimationScheduler } from "@/hooks/use-animation-scheduler";
import {
	ANTHONY_RIERA_ID,
	type FakeConversationHandledPayload,
	fakeConversations,
} from "../data";

type UseFakeInboxProps = {
	isPlaying: boolean;
	onComplete?: () => void;
	onShowMouseCursor?: () => void;
};

const SHOW_INBOX_CURSOR_AT_MS = 2000;

function toHeaderTimelineItem(
	conversationId: string,
	item: FakeConversationHandledPayload["lastTimelineItem"],
	fallbackCreatedAt: string
): NonNullable<ConversationHeader["lastTimelineItem"]> {
	const createdAt = item.createdAt || fallbackCreatedAt;

	return {
		id: item.id ?? `${conversationId}-handled-item`,
		conversationId,
		organizationId: item.organizationId,
		visibility: item.visibility,
		type: item.type,
		text: item.text,
		parts: item.parts as NonNullable<
			ConversationHeader["lastTimelineItem"]
		>["parts"],
		userId: item.userId,
		visitorId: item.visitorId,
		aiAgentId: item.aiAgentId,
		createdAt,
		deletedAt: item.deletedAt ?? null,
	};
}

export function useFakeInbox({
	isPlaying,
	onComplete,
	onShowMouseCursor,
}: UseFakeInboxProps) {
	const [conversations, setConversations] =
		useState<ConversationHeader[]>(fakeConversations);
	const hasScheduledRef = useRef(false);
	const scheduleRef = useRef<
		((timeMs: number, callback: () => void) => () => void) | null
	>(null);
	const onShowMouseCursorRef = useRef(onShowMouseCursor);
	const retryCountRef = useRef(0);

	useEffect(() => {
		onShowMouseCursorRef.current = onShowMouseCursor;
	}, [onShowMouseCursor]);

	const { schedule, reset: resetScheduler } = useAnimationScheduler({
		isPlaying,
		onComplete,
	});

	scheduleRef.current = schedule;
	useEffect(() => {
		scheduleRef.current = schedule;
	}, [schedule]);

	const resetDemoData = useCallback(() => {
		setConversations(fakeConversations);
		resetScheduler();
		hasScheduledRef.current = false;
		retryCountRef.current = 0;
	}, [resetScheduler]);

	const markConversationHandledByHuman = useCallback(
		(payload: FakeConversationHandledPayload) => {
			const handledAt = payload.handledAt ?? new Date().toISOString();
			const updatedTimelineItem = toHeaderTimelineItem(
				payload.conversationId,
				payload.lastTimelineItem,
				handledAt
			);
			const activityAt = updatedTimelineItem.createdAt;

			setConversations((prev) =>
				prev.map((conversation) => {
					if (conversation.id !== payload.conversationId) {
						return conversation;
					}

					return {
						...conversation,
						status: "open",
						resolvedAt: null,
						resolvedByUserId: null,
						resolvedByAiAgentId: null,
						escalationHandledAt: handledAt,
						escalationHandledByUserId: ANTHONY_RIERA_ID,
						title: payload.title ?? conversation.title,
						updatedAt: activityAt,
						lastMessageAt: activityAt,
						lastTimelineItem: updatedTimelineItem,
						lastMessageTimelineItem: updatedTimelineItem,
					};
				})
			);
		},
		[]
	);

	useEffect(() => {
		if (!isPlaying || hasScheduledRef.current) {
			return;
		}

		const scheduleTasks = () => {
			const currentSchedule = scheduleRef.current;
			if (!currentSchedule) {
				retryCountRef.current += 1;
				if (retryCountRef.current > 10) {
					return;
				}
				setTimeout(scheduleTasks, 10);
				return;
			}

			hasScheduledRef.current = true;
			retryCountRef.current = 0;

			currentSchedule(SHOW_INBOX_CURSOR_AT_MS, () => {
				onShowMouseCursorRef.current?.();
			});
		};

		scheduleTasks();
	}, [isPlaying]);

	return {
		conversations,
		resetDemoData,
		markConversationHandledByHuman,
	};
}
