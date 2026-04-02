"use client";

import type { ConversationStatus } from "@plasma/types";
import { useEffect, useRef } from "react";
import { ConversationsList } from "@/components/conversations-list";
import type { VirtualListItem } from "@/components/conversations-list/types";
import type { ConversationHeader } from "@/contexts/inboxes";
import { useConversationFocusStore } from "@/contexts/inboxes/conversation-focus-store";
import { useDashboardNewMessageSound } from "@/hooks/use-dashboard-new-message-sound";
import { useSidebar } from "@/hooks/use-sidebars";
import { useSoundPreferences } from "@/hooks/use-sound-preferences";

type ConversationsListPaneProps = {
	basePath: string;
	selectedConversationStatus: ConversationStatus | "archived" | null;
	conversations: ConversationHeader[];
	websiteSlug: string;
	smartItems?: VirtualListItem[] | null;
};

export function ConversationsListPane({
	basePath,
	selectedConversationStatus,
	conversations,
	websiteSlug,
	smartItems,
}: ConversationsListPaneProps) {
	const clearFocus = useConversationFocusStore((state) => state.clearFocus);
	const { open: isLeftSidebarOpen, toggle: toggleLeftSidebar } = useSidebar({
		position: "left",
	});

	const { newMessageEnabled } = useSoundPreferences({ websiteSlug });
	const playNewMessageSound = useDashboardNewMessageSound(newMessageEnabled);
	const previousConversationsRef = useRef<ConversationHeader[]>([]);

	useEffect(() => {
		clearFocus();
	}, [clearFocus, selectedConversationStatus]);

	// Play sound when new messages arrive in any conversation
	useEffect(() => {
		const currentConversations = conversations;
		const previousConversations = previousConversationsRef.current;

		if (previousConversations.length === 0) {
			// First render, just store the conversations
			previousConversationsRef.current = currentConversations;
			return;
		}

		// Check if any conversation has a new last message timestamp
		let hasNewMessage = false;

		for (const current of currentConversations) {
			const previous = previousConversations.find((c) => c.id === current.id);

			if (!previous) {
				// New conversation appeared
				continue;
			}

			// Check if last message timestamp has changed
			if (
				current.lastMessageAt &&
				previous.lastMessageAt &&
				new Date(current.lastMessageAt) > new Date(previous.lastMessageAt)
			) {
				hasNewMessage = true;
				break;
			}
		}

		if (hasNewMessage) {
			playNewMessageSound();
		}

		// Update the ref
		previousConversationsRef.current = currentConversations;
	}, [conversations, playNewMessageSound]);

	return (
		<ConversationsList
			basePath={basePath}
			conversations={conversations}
			isLeftSidebarOpen={isLeftSidebarOpen}
			onToggleLeftSidebar={toggleLeftSidebar}
			selectedConversationStatus={selectedConversationStatus}
			smartItems={smartItems}
			websiteSlug={websiteSlug}
		/>
	);
}
