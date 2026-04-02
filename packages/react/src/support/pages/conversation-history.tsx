import { useSupport } from "@plasma/react";
import { PENDING_CONVERSATION_ID } from "@plasma/react/utils/id";
import type React from "react";
import { useConversationHistoryPage } from "../../hooks/use-conversation-history-page";
import { AvatarStack } from "../components/avatar-stack";
import { CoButton } from "../components/button";
import { ConversationButtonLink } from "../components/conversation-button-link";
import { Header } from "../components/header";
import Icon from "../components/icons";
import { Watermark } from "../components/watermark";
import { useSupportNavigation } from "../store/support-store";
import { Text, useSupportText } from "../text";

type ConversationHistoryPageProps = {
	params?: undefined;
};

/**
 * Conversation history page with list of past conversations and pagination.
 */
export const ConversationHistoryPage: React.FC<ConversationHistoryPageProps> = (
	_props = {}
) => {
	const { goBack, canGoBack, navigate } = useSupportNavigation();
	const { availableAIAgents, availableHumanAgents } = useSupport();
	const text = useSupportText();

	const history = useConversationHistoryPage({
		initialVisibleCount: 4,
		onOpenConversation: (conversationId) => {
			navigate({
				page: "CONVERSATION",
				params: {
					conversationId,
				},
			});
		},
		onStartConversation: (initialMessage) => {
			navigate({
				page: "CONVERSATION",
				params: {
					conversationId: PENDING_CONVERSATION_ID,
					initialMessage,
				},
			});
		},
	});

	const handleGoBack = () => {
		if (canGoBack) {
			goBack();
		} else {
			navigate({
				page: "HOME",
			});
		}
	};

	return (
		<>
			<Header onGoBack={handleGoBack}>
				<div className="flex w-full items-center justify-between gap-2 py-3">
					<div className="flex flex-col">
						<h2 className="max-w-xs text-balance font-co-sans text-md leading-normal">
							{text("page.conversationHistory.title")}
						</h2>
					</div>
					<AvatarStack
						aiAgents={availableAIAgents}
						gapWidth={2}
						hideDefaultAIAgent={false}
						humanAgents={availableHumanAgents}
						size={32}
						spacing={28}
					/>
				</div>
			</Header>

			<div className="flex flex-1 flex-col items-center justify-between gap-2 px-6 pb-4">
				{history.conversations.length > 0 && (
					<div className="flex w-full flex-col items-center justify-between gap-2 pt-4">
						<div className="flex w-full flex-col overflow-clip rounded-md border border-co-border/80">
							{history.visibleConversations.map((conversation) => (
								<ConversationButtonLink
									className="rounded-none"
									conversation={conversation}
									key={conversation.id}
									onClick={() => history.openConversation(conversation.id)}
								/>
							))}
						</div>
						{history.hasMore && (
							<CoButton
								className="relative mt-6 w-full text-co-primary/40 text-xs hover:text-co-primary"
								onClick={history.showAll}
								variant="ghost"
							>
								<Text
									as="span"
									textKey="page.conversationHistory.showMore"
									variables={{ count: history.remainingCount }}
								/>
							</CoButton>
						)}
					</div>
				)}

				<div className="sticky bottom-4 z-10 flex w-full flex-col items-center gap-2">
					<CoButton
						className="relative w-full justify-between"
						onClick={() => history.startConversation()}
						size="large"
						variant="secondary"
					>
						<Icon
							className="-translate-y-1/2 absolute top-1/2 right-4 size-3 text-co-primary/60 transition-transform duration-200 group-hover/btn:translate-x-0.5 group-hover/btn:text-co-primary"
							name="arrow-right"
							variant="default"
						/>
						<Text as="span" textKey="common.actions.askQuestion" />
					</CoButton>
					<Watermark className="mt-4 mb-2" />
				</div>
			</div>
		</>
	);
};
