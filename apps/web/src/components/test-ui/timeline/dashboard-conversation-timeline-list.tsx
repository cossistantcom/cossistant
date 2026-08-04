"use client";

import type { RouterOutputs } from "@api/trpc/types";
import {
	ConversationTimelineContainer,
	DaySeparator,
	DaySeparatorLabel,
	DaySeparatorLine,
	ConversationTimeline as PrimitiveConversationTimeline,
} from "@cossistant/next/primitives";
import { useGroupedMessages } from "@cossistant/react/internal/hooks";
import type { AvailableAIAgent, ConversationHeader } from "@cossistant/types";
import type {
	TimelineItem,
	TimelinePartEvent,
} from "@cossistant/types/api/timeline-item";
import { useEffect, useMemo, useRef } from "react";
import {
	buildDashboardTimelineRenderItems,
	buildPublicActivityGroupFromTool,
} from "@/components/conversation/messages/dashboard-timeline-render-items";
import { DeveloperLogGroup } from "@/components/conversation/messages/developer-log-group";
import { ConversationEvent } from "@/components/conversation/messages/event";
import { TimelineActivityGroup } from "@/components/conversation/messages/timeline-activity-group";
import { TimelineMessageGroup } from "@/components/conversation/messages/timeline-message-group";
import {
	TypingIndicator,
	type TypingParticipant,
} from "@/components/conversation/messages/typing-indicator";
import type { ConversationTimelineItem } from "@/data/conversation-message-cache";
import { isCustomerFacingToolTimelineItem } from "@/lib/tool-timeline-visibility";
import { cn } from "@/lib/utils";

export type TestDashboardTypingActor = {
	conversationId: string;
	actorType: "visitor" | "ai_agent";
	actorId: string;
	preview: string | null;
};

type TestDashboardConversationTimelineListProps = {
	items: TimelineItem[] | ConversationTimelineItem[];
	visitor: ConversationHeader["visitor"];
	className?: string;
	typingActors?: TestDashboardTypingActor[];
	layoutMode?: "scroll" | "centered";
	inputHeight?: number;
	isDeveloperModeEnabled?: boolean;
	currentUserId?: string;
};

const TEST_UI_USER_ID = "01JGUSER1111111111111111";

export function formatTestUiTimestamp(date: Date): string {
	return date.toLocaleTimeString("en-US", {
		hour: "2-digit",
		hour12: true,
		minute: "2-digit",
		timeZone: "UTC",
	});
}

export function formatTestUiDate(date: Date): string {
	return date.toLocaleDateString("en-US", {
		day: "numeric",
		month: "long",
		timeZone: "UTC",
		year: "numeric",
	});
}

const fakeAvailableAIAgents: AvailableAIAgent[] = [
	{
		id: "01JGAIA11111111111111111",
		name: "Cossistant AI",
		image: null,
	},
];

const fakeTeamMembers: RouterOutputs["user"]["getWebsiteMembers"] = [
	{
		id: TEST_UI_USER_ID,
		name: "Anthony Riera",
		email: "anthony@cossistant.com",
		image: "https://github.com/rieranthony.png",
		lastSeenAt: "2026-04-14T09:58:00.000Z",
		role: "admin",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-04-14T09:58:00.000Z",
	},
];

const fakeAvailableHumanAgents = [
	{
		id: TEST_UI_USER_ID,
		name: "Anthony Riera",
		email: "anthony@example.com",
		image: "https://github.com/rieranthony.png",
		lastSeenAt: "2026-04-14T09:58:00.000Z",
	},
];

function extractEventPart(item: TimelineItem): TimelinePartEvent | null {
	if (item.type !== "event") {
		return null;
	}

	return (
		item.parts.find(
			(part): part is TimelinePartEvent => part.type === "event"
		) ?? null
	);
}

export function TestDashboardConversationTimelineList({
	items: timelineItems,
	visitor,
	className,
	typingActors = [],
	layoutMode = "centered",
	inputHeight = 140,
	isDeveloperModeEnabled = false,
	currentUserId = TEST_UI_USER_ID,
}: TestDashboardConversationTimelineListProps) {
	const messageListRef = useRef<HTMLDivElement | null>(null);
	const normalizedTimelineItems = timelineItems as unknown as TimelineItem[];

	const visibleTimelineItems = useMemo(
		() =>
			isDeveloperModeEnabled
				? normalizedTimelineItems
				: normalizedTimelineItems.filter(
						(item) =>
							item.type !== "tool" || isCustomerFacingToolTimelineItem(item)
					),
		[isDeveloperModeEnabled, normalizedTimelineItems]
	);

	const { items: groupedItems, lastReadMessageMap } = useGroupedMessages({
		items: visibleTimelineItems,
		seenData: [],
		currentViewerId: currentUserId,
	});

	const renderItems = useMemo(
		() =>
			buildDashboardTimelineRenderItems(groupedItems, isDeveloperModeEnabled),
		[groupedItems, isDeveloperModeEnabled]
	);

	const activeTypingEntities = useMemo<TypingParticipant[]>(
		() =>
			typingActors.reduce<TypingParticipant[]>((acc, actor) => {
				if (actor.actorType === "visitor") {
					if (actor.actorId !== visitor?.id) {
						return acc;
					}

					acc.push({
						id: actor.actorId,
						type: "visitor",
						preview: actor.preview,
					});
					return acc;
				}

				acc.push({
					id: actor.actorId,
					type: "ai",
					preview: actor.preview,
				});
				return acc;
			}, []),
		[typingActors, visitor?.id]
	);

	useEffect(() => {
		if (!messageListRef.current || activeTypingEntities.length === 0) {
			return;
		}

		messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
	}, [activeTypingEntities]);

	return (
		<PrimitiveConversationTimeline
			autoScroll={layoutMode === "scroll"}
			className={cn(
				layoutMode === "scroll"
					? "min-h-0 w-full flex-1 overflow-y-auto pt-6"
					: "w-full overflow-visible py-0",
				className
			)}
			data-fake-conversation-layout-mode={layoutMode}
			id="test-dashboard-conversation-timeline"
			items={normalizedTimelineItems}
			ref={messageListRef}
			style={
				layoutMode === "scroll"
					? {
							paddingBottom: `${inputHeight + 100}px`,
						}
					: undefined
			}
		>
			<div
				className={cn(
					"mx-auto w-full max-w-3xl px-6 py-6",
					layoutMode === "centered" && "py-4"
				)}
			>
				<ConversationTimelineContainer className="flex w-full flex-col gap-5">
					{renderItems.map((item, index) => {
						if (item.type === "day_separator") {
							return (
								<DaySeparator
									className="flex items-center gap-4 py-2"
									date={item.date}
									dateString={item.dateString}
									formatDate={formatTestUiDate}
									key={`day-separator-${item.dateString}`}
								>
									{({ formattedDate }) => (
										<>
											<DaySeparatorLine className="h-px flex-1 bg-border/50" />
											<DaySeparatorLabel
												className="text-muted-foreground/70 text-xs"
												formattedDate={formattedDate}
											/>
											<DaySeparatorLine className="h-px flex-1 bg-border/50" />
										</>
									)}
								</DaySeparator>
							);
						}

						if (item.type === "public_activity_group") {
							const key =
								item.firstItemId || item.items[0]?.id || `activity-${index}`;

							return (
								<TimelineActivityGroup
									availableAIAgents={fakeAvailableAIAgents}
									currentUserId={currentUserId}
									group={item}
									key={key}
									teamMembers={fakeTeamMembers}
									visitor={visitor}
								/>
							);
						}

						if (item.type === "developer_log_group") {
							const key =
								item.firstItemId || item.items[0]?.id || `developer-${index}`;

							return (
								<DeveloperLogGroup
									availableAIAgents={fakeAvailableAIAgents}
									currentUserId={currentUserId}
									group={item}
									key={key}
									teamMembers={fakeTeamMembers}
									visitor={visitor}
								/>
							);
						}

						if (item.type === "timeline_event") {
							const eventPart = extractEventPart(item.item);
							if (!eventPart) {
								return null;
							}

							return (
								<ConversationEvent
									availableAIAgents={fakeAvailableAIAgents}
									availableHumanAgents={fakeAvailableHumanAgents}
									createdAt={item.item.createdAt}
									event={eventPart}
									key={item.item.id ?? `event-${index}`}
									visitor={visitor}
								/>
							);
						}

						if (item.type === "public_timeline_tool") {
							return (
								<TimelineActivityGroup
									availableAIAgents={fakeAvailableAIAgents}
									currentUserId={currentUserId}
									group={buildPublicActivityGroupFromTool(item.item)}
									key={item.item.id ?? `tool-${index}`}
									teamMembers={fakeTeamMembers}
									visitor={visitor}
								/>
							);
						}

						return (
							<TimelineMessageGroup
								availableAIAgents={fakeAvailableAIAgents}
								currentUserId={currentUserId}
								formatTimestamp={formatTestUiTimestamp}
								items={item.items}
								key={item.items[0]?.id ?? `group-${index}`}
								lastReadMessageIds={lastReadMessageMap}
								teamMembers={fakeTeamMembers}
								visitor={visitor}
								visitorPresence={null}
							/>
						);
					})}
					{activeTypingEntities.length > 0 ? (
						<div data-test-ui-typing-surface="dashboard">
							<TypingIndicator
								activeTypingEntities={activeTypingEntities}
								availableAIAgents={fakeAvailableAIAgents}
								availableHumanAgents={fakeAvailableHumanAgents}
								className="mt-2"
								visitor={visitor}
								visitorPresence={null}
							/>
						</div>
					) : null}
				</ConversationTimelineContainer>
			</div>
		</PrimitiveConversationTimeline>
	);
}
