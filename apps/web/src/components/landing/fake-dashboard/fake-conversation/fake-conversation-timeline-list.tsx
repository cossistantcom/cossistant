"use client";

import { useGroupedMessages } from "@plasma/next/hooks";
import {
	ConversationTimelineContainer,
	ConversationTimeline as PrimitiveConversationTimeline,
} from "@plasma/next/primitives";
import type {
	TimelineItem,
	TimelinePartEvent,
} from "@plasma/types/api/timeline-item";
import { AnimatePresence } from "motion/react";
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
import type { ConversationHeader } from "@/contexts/inboxes";
import type { ConversationTimelineItem } from "@/data/conversation-message-cache";
import { isCustomerFacingToolTimelineItem } from "@/lib/tool-timeline-visibility";
import { cn } from "@/lib/utils";
import { type FakeTypingActor, fakeAIAgent } from "../data";

function extractEventPart(item: TimelineItem): TimelinePartEvent | null {
	if (item.type !== "event") {
		return null;
	}

	const eventPart = item.parts.find(
		(part): part is TimelinePartEvent => part.type === "event"
	);

	return eventPart || null;
}

type FakeConversationTimelineListProps = {
	items: ConversationTimelineItem[];
	visitor: ConversationHeader["visitor"];
	className?: string;
	typingActors: FakeTypingActor[];
	layoutMode?: "scroll" | "centered";
	inputHeight?: number;
};

const ANTHONY_RIERA_ID = "01JGUSER1111111111111111";

const fakeTeamMembers = [
	{
		id: ANTHONY_RIERA_ID,
		name: "Anthony Riera",
		email: "the.shadcn@example.com",
		image: "https://github.com/rieranthony.png",
		lastSeenAt: new Date().toISOString(),
		role: "admin" as const,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		organizationId: "01JGORG11111111111111111",
	},
];

const fakeAvailableHumanAgents = [
	{
		id: ANTHONY_RIERA_ID,
		name: "Anthony Riera",
		image: "https://github.com/rieranthony.png",
		lastSeenAt: new Date().toISOString(),
	},
];

const fakeAvailableAIAgents = [fakeAIAgent];

export function FakeConversationTimelineList({
	items: timelineItems,
	visitor,
	className,
	typingActors,
	layoutMode = "scroll",
	inputHeight = 140,
}: FakeConversationTimelineListProps) {
	const messageListRef = useRef<HTMLDivElement | null>(null);

	const visibleTimelineItems = useMemo(
		() =>
			(timelineItems as unknown as TimelineItem[]).filter(
				(item) => item.type !== "tool" || isCustomerFacingToolTimelineItem(item)
			),
		[timelineItems]
	);

	const { items: groupedItems } = useGroupedMessages({
		items: visibleTimelineItems,
		seenData: [],
		currentViewerId: ANTHONY_RIERA_ID,
	});

	const renderItems = useMemo(
		() => buildDashboardTimelineRenderItems(groupedItems, false),
		[groupedItems]
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
					? "min-h-0 w-full flex-1 overflow-y-scroll pt-20"
					: "w-full overflow-visible py-0",
				layoutMode === "scroll" &&
					"scrollbar-thin scrollbar-thumb-background-300 scrollbar-track-fd-overlay",
				className
			)}
			data-fake-conversation-layout-mode={layoutMode}
			id="fake-conversation-timeline"
			items={timelineItems as unknown as TimelineItem[]}
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
					"mx-auto pr-4 pl-6 xl:max-w-xl 2xl:max-w-2xl",
					layoutMode === "centered" && "w-full px-0 pr-0"
				)}
			>
				<ConversationTimelineContainer
					className={cn(
						"flex w-full flex-col gap-5",
						layoutMode === "scroll" ? "min-h-full" : "justify-center"
					)}
				>
					<AnimatePresence initial={false} mode="popLayout">
						{renderItems.map((item, index) => {
							if (item.type === "public_activity_group") {
								const key =
									item.firstItemId || item.items[0]?.id || `activity-${index}`;

								return (
									<TimelineActivityGroup
										availableAIAgents={fakeAvailableAIAgents}
										currentUserId={ANTHONY_RIERA_ID}
										group={item}
										key={key}
										teamMembers={fakeTeamMembers}
										visitor={visitor}
									/>
								);
							}

							if (item.type === "developer_log_group") {
								const key =
									item.firstItemId || item.items[0]?.id || `dev-log-${index}`;

								return (
									<DeveloperLogGroup
										availableAIAgents={fakeAvailableAIAgents}
										currentUserId={ANTHONY_RIERA_ID}
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
										key={item.item.id || `timeline-event-${index}`}
										visitor={visitor}
									/>
								);
							}

							if (item.type === "public_timeline_tool") {
								const key = item.item.id ?? `timeline-tool-${index}`;
								return (
									<TimelineActivityGroup
										availableAIAgents={fakeAvailableAIAgents}
										currentUserId={ANTHONY_RIERA_ID}
										group={buildPublicActivityGroupFromTool(item.item)}
										key={key}
										teamMembers={fakeTeamMembers}
										visitor={visitor}
									/>
								);
							}

							if (item.type === "day_separator") {
								return null;
							}

							const groupKey = item.items[0]?.id || `group-${index}`;

							return (
								<TimelineMessageGroup
									availableAIAgents={fakeAvailableAIAgents}
									currentUserId={ANTHONY_RIERA_ID}
									items={item.items as unknown as TimelineItem[]}
									key={groupKey}
									lastReadMessageIds={new Map()}
									teamMembers={fakeTeamMembers}
									visitor={visitor}
									visitorPresence={null}
								/>
							);
						})}
					</AnimatePresence>
					{activeTypingEntities.length > 0 && (
						<TypingIndicator
							activeTypingEntities={activeTypingEntities}
							availableAIAgents={fakeAvailableAIAgents}
							availableHumanAgents={fakeAvailableHumanAgents}
							className="mt-2"
							visitor={visitor}
							visitorPresence={null}
						/>
					)}
				</ConversationTimelineContainer>
			</div>
		</PrimitiveConversationTimeline>
	);
}
