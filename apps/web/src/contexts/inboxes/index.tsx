/** biome-ignore-all lint/style/noNonNullAssertion: ok here */
"use client";

import type { RouterOutputs } from "@plasma/api/types";
import type { ConversationStatus } from "@plasma/types";
import { usePathname } from "next/navigation";
import { createContext, useContext, useMemo } from "react";
import type { VirtualListItem } from "@/components/conversations-list/types";
import { extractInboxParamsFromSlug } from "@/lib/url";
import { useWebsite, useWebsiteViews } from "../website";
import { useFilteredConversations } from "./use-filtered-conversations";

export type ConversationHeader =
	RouterOutputs["conversation"]["listConversationsHeaders"]["items"][number];

type InboxesContextValue = {
	statusCounts: {
		open: number;
		resolved: number;
		spam: number;
		archived: number;
	};
	// Navigation
	goBack: () => void;
	nextConversation: ConversationHeader | null;
	previousConversation: ConversationHeader | null;
	navigateToNextConversation: () => void;
	navigateToPreviousConversation: () => void;
	navigateAwayIfNeeded: (conversationId: string) => boolean;
	conversations: ConversationHeader[];
	selectedConversationStatus: ConversationStatus | "archived" | null;
	selectedConversation: ConversationHeader | null;
	selectedConversationLocked: boolean;
	selectedConversationIndex: number;
	selectedVisitorId: string | null;
	selectedConversationId: string | null;
	basePath: string;
	selectedViewId: string | null;
	isLoading: boolean;
	// Smart ordering
	smartOrderResult: {
		items: VirtualListItem[];
		conversationIndexMap: Map<string, number>;
	} | null;
	isSmartModeActive: boolean;
};

const InboxesContext = createContext<InboxesContextValue | null>(null);

export function useOptionalInboxes() {
	return useContext(InboxesContext);
}

type InboxesProviderProps = {
	children: React.ReactNode;
	websiteSlug: string;
};

export function InboxesProvider({
	children,
	websiteSlug,
}: InboxesProviderProps) {
	const views = useWebsiteViews();
	const pathname = usePathname();
	const website = useWebsite();

	// Extract the inbox params from the pathname
	const {
		selectedConversationStatus,
		selectedConversationId,
		basePath,
		selectedViewId,
	} = useMemo(() => {
		const slug = pathname.split("/").slice(1);

		return extractInboxParamsFromSlug({
			slug: slug || [],
			availableViews: views,
			websiteSlug,
		});
	}, [pathname, views, websiteSlug]);

	const {
		conversations,
		isLoading,
		statusCounts,
		selectedConversationIndex,
		selectedConversation,
		selectedConversationLocked,
		selectedVisitorId,
		goBack,
		nextConversation,
		previousConversation,
		navigateToNextConversation,
		navigateToPreviousConversation,
		navigateAwayIfNeeded,
		smartOrderResult,
		isSmartModeActive,
	} = useFilteredConversations({
		selectedConversationStatus,
		selectedViewId,
		selectedConversationId,
		basePath,
	});

	return (
		<InboxesContext.Provider
			value={{
				statusCounts,
				conversations,
				selectedConversationStatus,
				selectedConversationId,
				selectedConversation,
				selectedConversationLocked,
				selectedVisitorId,
				basePath,
				selectedViewId,
				isLoading,
				selectedConversationIndex,
				goBack,
				nextConversation,
				previousConversation,
				navigateToNextConversation,
				navigateToPreviousConversation,
				navigateAwayIfNeeded,
				// Smart ordering
				smartOrderResult,
				isSmartModeActive,
			}}
		>
			{children}
		</InboxesContext.Provider>
	);
}

export function useInboxes() {
	const context = useOptionalInboxes();

	if (!context) {
		throw new Error("useInboxes must be used within a InboxesProvider");
	}

	//   if (context.isLoading) {
	//     throw new Error("Conversations not found");
	//   }

	return context;
}
