"use client";

import { SupportConfig } from "@cossistant/next/support-config";
import { SenderType } from "@cossistant/types";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useInboxes } from "@/contexts/inboxes";
import { useUserSession } from "@/contexts/website";
import { ConversationPane } from "./conversation-pane";
import { ConversationsListPane } from "./conversations-list-pane";

type InboxClientProps = {
	websiteSlug: string;
};

export default function InboxClientRouter({ websiteSlug }: InboxClientProps) {
	const router = useRouter();
	const { user } = useUserSession();

	const {
		selectedConversationId,
		selectedConversationLocked,
		conversations,
		selectedConversationStatus,
		basePath,
		selectedVisitorId,
		smartOrderResult,
	} = useInboxes();

	useEffect(() => {
		if (selectedConversationId && selectedConversationLocked) {
			const listPath = basePath.split("/").slice(0, -1).join("/") || basePath;
			router.replace(listPath);
		}
	}, [selectedConversationId, selectedConversationLocked, router, basePath]);

	return selectedConversationId && selectedVisitorId ? (
		<>
			<ConversationPane
				conversationId={selectedConversationId}
				currentUserId={user.id}
				visitorId={selectedVisitorId}
				websiteSlug={websiteSlug}
			/>
			<SupportConfig
				defaultMessages={[
					{
						content: `Hi ${user.name || "there"}, anything I can help with?`,
						senderType: SenderType.TEAM_MEMBER,
					},
				]}
				quickOptions={["How to identify a visitor?"]}
			/>
		</>
	) : (
		<>
			<ConversationsListPane
				basePath={basePath}
				conversations={conversations}
				selectedConversationStatus={selectedConversationStatus}
				smartItems={smartOrderResult?.items}
				websiteSlug={websiteSlug}
			/>
			<SupportConfig
				defaultMessages={[
					{
						content: `Hi ${user.name || "there"}, anything I can help with?`,
						senderType: SenderType.TEAM_MEMBER,
					},
				]}
			/>
		</>
	);
}
