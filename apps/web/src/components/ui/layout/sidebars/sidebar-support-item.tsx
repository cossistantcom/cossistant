"use client";

import { resolveTimelineItemText } from "@cossistant/core";
import { useConversations } from "@cossistant/next/hooks";
import { useSupport } from "@cossistant/next/provider";
import { useSupportNavigation } from "@cossistant/next/support";
import { formatMessagePreview } from "@cossistant/tiny-markdown/utils";
import { ConversationStatus } from "@cossistant/types/enums";
import type { Conversation } from "@cossistant/types/schemas";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { BouncingDots } from "@/components/conversation/messages/typing-indicator";
import { Badge } from "@/components/ui/badge";
import { SidebarItem } from "@/components/ui/layout/sidebars/sidebar-item";
import { useSupportOverlayState } from "@/hooks/use-support-overlay-state";
import { cn } from "@/lib/utils";

const SUPPORT_CONVERSATION_LABEL = "Conversation with support";

type SupportTypingStoreState = {
	conversations: Record<
		string,
		Record<
			string,
			{
				actorType?: string | null;
			}
		>
	>;
};

type SupportTypingStore = {
	getState: () => SupportTypingStoreState;
	subscribe: (listener: () => void) => () => void;
};

type SupportConversationPreview =
	| {
			label: string;
			type: "message";
	  }
	| {
			label: string;
			type: "typing";
	  }
	| {
			label: string;
			type: "unread";
	  };

type SupportSidebarConversation = Conversation & {
	resolvedAt?: string | null;
	resolvedByAiAgentId?: string | null;
	resolvedByUserId?: string | null;
};

function getTeamMemberTypingConversationIds(
	state: SupportTypingStoreState | null
) {
	if (!state) {
		return [];
	}

	return Object.entries(state.conversations)
		.filter(([, entries]) =>
			Object.values(entries).some((entry) => entry.actorType === "user")
		)
		.map(([conversationId]) => conversationId);
}

function useTeamMemberTypingConversationIds(
	typingStore: SupportTypingStore | null | undefined
) {
	const subscribe = useCallback(
		(onStoreChange: () => void) =>
			typingStore ? typingStore.subscribe(onStoreChange) : () => {},
		[typingStore]
	);
	const getSnapshot = useCallback(
		() =>
			typingStore
				? getTeamMemberTypingConversationIds(typingStore.getState()).join(
						"\u001f"
					)
				: "",
		[typingStore]
	);
	const conversationIdsKey = useSyncExternalStore(
		subscribe,
		getSnapshot,
		getSnapshot
	);

	return useMemo(
		() => (conversationIdsKey ? conversationIdsKey.split("\u001f") : []),
		[conversationIdsKey]
	);
}

function isOngoingOpenConversation(conversation: SupportSidebarConversation) {
	return (
		conversation.status === ConversationStatus.OPEN &&
		!conversation.deletedAt &&
		!conversation.resolvedAt &&
		!conversation.resolvedByAiAgentId &&
		!conversation.resolvedByUserId
	);
}

function selectSupportConversation(
	conversations: SupportSidebarConversation[],
	typingConversationIds: string[]
) {
	const openConversations = conversations.filter(isOngoingOpenConversation);
	const typingConversationIdSet = new Set(typingConversationIds);
	const typingConversation = openConversations.find((conversation) =>
		typingConversationIdSet.has(conversation.id)
	);

	return typingConversation ?? openConversations[0] ?? null;
}

function getSupportConversationLastMessage(conversation: Conversation) {
	if (!conversation.lastTimelineItem) {
		return null;
	}

	const text = resolveTimelineItemText(
		conversation.lastTimelineItem,
		"visitor"
	)?.trim();

	return text ? formatMessagePreview(text) : null;
}

function formatUnreadMessagesLabel(unreadCount: number) {
	return `${unreadCount} unread message${unreadCount === 1 ? "" : "s"}`;
}

function getSupportConversationPreview({
	conversation,
	isTyping,
	unreadCount,
}: {
	conversation: Conversation;
	isTyping: boolean;
	unreadCount: number;
}): SupportConversationPreview {
	if (isTyping) {
		return {
			label: "Support is typing...",
			type: "typing",
		};
	}

	if (unreadCount > 0) {
		return {
			label: formatUnreadMessagesLabel(unreadCount),
			type: "unread",
		};
	}

	return {
		label: getSupportConversationLastMessage(conversation) || "We are on it",
		type: "message",
	};
}

function SidebarSupportConversationItem({
	active,
	conversation,
	isTyping,
	onOpen,
	unreadCount,
}: {
	active: boolean;
	conversation: Conversation;
	isTyping: boolean;
	onOpen: () => void;
	unreadCount: number;
}) {
	const preview = getSupportConversationPreview({
		conversation,
		isTyping,
		unreadCount,
	});

	return (
		<button
			aria-label="Open support conversation"
			className={cn(
				"group/btn relative flex w-full items-center gap-2 rounded border border-border/70 bg-background-50 px-3 py-2 text-left transition-colors hover:border-border hover:bg-background-100 dark:bg-background-300/60 dark:hover:bg-background-300",
				active && "border-border bg-background-100 dark:bg-background-300"
			)}
			data-active={String(active)}
			onClick={onOpen}
			type="button"
		>
			<span className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span className="flex min-w-0 items-center justify-between gap-2">
					<span
						className="truncate font-medium text-primary text-sm"
						data-slot="support-conversation-label"
					>
						{SUPPORT_CONVERSATION_LABEL}
					</span>
					<Badge
						className="h-4 rounded border-cossistant-green/30 bg-cossistant-green/10 px-1.5 text-[10px] text-cossistant-green leading-none dark:border-cossistant-green/40 dark:bg-cossistant-green/15"
						variant="outline"
					>
						Open
					</Badge>
				</span>
				<span
					className="flex min-w-0 items-center gap-1.5 text-primary/60 text-sm"
					data-slot="support-conversation-preview"
				>
					{preview.type === "typing" ? (
						<span aria-hidden="true" className="shrink-0">
							<BouncingDots className="opacity-70" />
						</span>
					) : null}
					{preview.type === "unread" ? (
						<span
							aria-hidden="true"
							className="size-1.5 shrink-0 rounded-full bg-destructive"
							data-slot="support-unread-dot"
						/>
					) : null}
					<span className="truncate">{preview.label}</span>
				</span>
			</span>
		</button>
	);
}

export function SidebarSupportItem() {
	const { client, unreadCount } = useSupport();
	const { navigate } = useSupportNavigation();
	const { isOpen, openSupportOverlay } = useSupportOverlayState();
	const typingConversationIds = useTeamMemberTypingConversationIds(
		client?.typingStore
	);
	const { conversations } = useConversations({
		limit: 10,
		order: "desc",
		orderBy: "updatedAt",
		status: ConversationStatus.OPEN,
	});
	const supportConversation = selectSupportConversation(
		conversations,
		typingConversationIds
	);
	const openOverlay = useCallback(
		(conversationId?: string) => {
			if (conversationId) {
				navigate({
					page: "CONVERSATION",
					params: { conversationId },
				});
			}

			void openSupportOverlay();
		},
		[navigate, openSupportOverlay]
	);

	if (supportConversation) {
		return (
			<SidebarSupportConversationItem
				active={isOpen}
				conversation={supportConversation}
				isTyping={typingConversationIds.includes(supportConversation.id)}
				onOpen={() => openOverlay(supportConversation.id)}
				unreadCount={unreadCount}
			/>
		);
	}

	return (
		<SidebarItem active={isOpen} onClick={() => openOverlay()}>
			Need help?
		</SidebarItem>
	);
}
