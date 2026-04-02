import type { ConversationHeader } from "@plasma/types";
import { differenceInHours } from "date-fns";
import { type ReactNode, useMemo } from "react";
import { CategoryHeader } from "@/components/conversations-list/category-header";
import { ConversationItemView } from "@/components/conversations-list/conversation-item";
import { PageContent } from "@/components/ui/layout";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getWaitingSinceLabel } from "@/lib/date";
import {
	buildTimelineEventPreview,
	extractEventPart,
} from "@/lib/timeline-events";
import { cn } from "@/lib/utils";
import { getVisitorNameWithFallback } from "@/lib/visitors";
import { fakeAIAgent, MARC_CONVERSATION_ID } from "../data";
import { buildFakeSmartOrderedList } from "./smart-grouping";

const fakeAvailableHumanAgents = [
	{
		id: "01JGUSER1111111111111111",
		name: "Anthony Riera",
		image: "https://github.com/rieranthony.png",
		lastSeenAt: new Date().toISOString(),
	},
];

type FakeConversationListItemProps = {
	conversation: ConversationHeader;
	itemRef?:
		| React.RefCallback<HTMLDivElement>
		| React.RefObject<HTMLDivElement | null>;
	focused?: boolean;
};

export function FakeConversationListItem({
	conversation,
	itemRef,
	focused = false,
}: FakeConversationListItemProps) {
	const visitorName = getVisitorNameWithFallback(conversation.visitor);
	const lastTimelineItem = conversation.lastTimelineItem;
	const lastTimelineItemCreatedAt = lastTimelineItem?.createdAt
		? new Date(lastTimelineItem.createdAt)
		: null;
	const isLastMessageFromAI = Boolean(lastTimelineItem?.aiAgentId);

	const hasUnreadMessage = useMemo(() => {
		if (!(lastTimelineItemCreatedAt && lastTimelineItem)) {
			return false;
		}

		const isFromVisitor = Boolean(
			lastTimelineItem.visitorId &&
				!lastTimelineItem.userId &&
				!lastTimelineItem.aiAgentId
		);

		if (!isFromVisitor) {
			return false;
		}

		const headerLastSeenAt = conversation.lastSeenAt
			? new Date(conversation.lastSeenAt)
			: null;

		return !headerLastSeenAt || lastTimelineItemCreatedAt > headerLastSeenAt;
	}, [conversation.lastSeenAt, lastTimelineItem, lastTimelineItemCreatedAt]);

	const waitingSinceLabel = useMemo(() => {
		if (!(lastTimelineItemCreatedAt && lastTimelineItem)) {
			return null;
		}

		const isFromVisitor = Boolean(
			lastTimelineItem.visitorId &&
				!lastTimelineItem.userId &&
				!lastTimelineItem.aiAgentId
		);

		if (!isFromVisitor) {
			return null;
		}

		const now = new Date();
		const hoursAgo = differenceInHours(now, lastTimelineItemCreatedAt);

		if (hoursAgo < 8) {
			return null;
		}

		return getWaitingSinceLabel(lastTimelineItemCreatedAt);
	}, [lastTimelineItem, lastTimelineItemCreatedAt]);

	const lastTimelineContent = useMemo(() => {
		if (!lastTimelineItem) {
			return <span className="truncate" />;
		}

		const eventPart = extractEventPart(lastTimelineItem);
		if (!eventPart) {
			return <span className="truncate">{lastTimelineItem.text ?? ""}</span>;
		}

		const eventPreview = buildTimelineEventPreview({
			event: eventPart,
			availableAIAgents: [fakeAIAgent],
			availableHumanAgents: fakeAvailableHumanAgents,
			visitor: conversation.visitor,
		});

		return (
			<>
				<span className="shrink-0 rounded-full bg-background-300 px-2 py-0.5 font-semibold text-[11px] text-muted-foreground uppercase tracking-tight">
					Event
				</span>
				<span className="truncate">{eventPreview}</span>
			</>
		);
	}, [conversation.visitor, lastTimelineItem]);

	return (
		<div
			ref={(element) => {
				if (!itemRef) {
					return;
				}

				if (typeof itemRef === "function") {
					itemRef(element);
					return;
				}

				if ("current" in itemRef) {
					(itemRef as React.MutableRefObject<HTMLDivElement | null>).current =
						element;
				}
			}}
		>
			<ConversationItemView
				focused={focused}
				hasUnreadMessage={hasUnreadMessage}
				isLastMessageFromAI={isLastMessageFromAI}
				isTyping={false}
				lastTimelineContent={lastTimelineContent}
				lastTimelineItemCreatedAt={lastTimelineItemCreatedAt}
				visitorAvatarUrl={conversation.visitor?.contact?.image ?? null}
				visitorLastSeenAt={conversation.visitor?.lastSeenAt ?? null}
				visitorName={visitorName}
				waitingSinceLabel={waitingSinceLabel}
			/>
		</div>
	);
}

type FakeConversationListProps = {
	conversations: ConversationHeader[];
	marcConversationRef?: React.RefObject<HTMLDivElement | null>;
	analyticsSlot?: ReactNode;
};

export function FakeConversationList({
	conversations,
	marcConversationRef,
	analyticsSlot,
}: FakeConversationListProps) {
	const groupedResult = useMemo(
		() => buildFakeSmartOrderedList(conversations),
		[conversations]
	);

	const focusedConversationId = useMemo(
		() =>
			groupedResult.items.find((item) => item.type === "conversation")
				?.conversation.id ?? null,
		[groupedResult.items]
	);

	return (
		<PageContent className="h-full contain-strict">
			<ScrollArea className="h-full">
				{analyticsSlot ? (
					<div className="pt-2 pb-8" data-slot="fake-inbox-analytics-slot">
						{analyticsSlot}
					</div>
				) : null}
				{groupedResult.items.map((item, index) => {
					if (item.type === "header") {
						const isFirstHeader = index === 0;
						return (
							<div
								className={cn(isFirstHeader ? "pt-3" : "pt-4")}
								key={`header-${item.category}`}
							>
								<CategoryHeader
									category={item.category}
									count={item.count}
									label={item.label}
								/>
							</div>
						);
					}

					const conversation = item.conversation;
					const isMarcConversation = conversation.id === MARC_CONVERSATION_ID;
					const isFirstAfterHeader =
						index > 0 && groupedResult.items[index - 1]?.type === "header";

					return (
						<div
							className={cn(isFirstAfterHeader && "pt-2")}
							key={conversation.id}
						>
							<FakeConversationListItem
								conversation={conversation}
								focused={focusedConversationId === conversation.id}
								itemRef={isMarcConversation ? marcConversationRef : undefined}
							/>
						</div>
					);
				})}
			</ScrollArea>
		</PageContent>
	);
}
