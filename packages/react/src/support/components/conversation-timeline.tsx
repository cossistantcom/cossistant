import type { AvailableAIAgent, AvailableHumanAgent } from "@plasma/types";
import type {
	TimelineItem,
	TimelinePartEvent,
} from "@plasma/types/api/timeline-item";
import type React from "react";
import type { DaySeparatorItem } from "../../hooks/private/use-grouped-messages";
import { useConversationTimeline } from "../../hooks/use-conversation-timeline";
import { useTypingSound } from "../../hooks/use-typing-sound";
import {
	ConversationTimelineContainer,
	ConversationTimeline as PrimitiveConversationTimeline,
} from "../../primitives/conversation-timeline";
import {
	DaySeparator,
	DaySeparatorLabel,
	DaySeparatorLine,
	defaultFormatDate,
} from "../../primitives/day-separator";
import { cn } from "../utils";
import { ConversationEvent } from "./conversation-event";
import { TimelineActivityGroup } from "./timeline-activity-group";
import { TimelineMessageGroup } from "./timeline-message-group";
import { resolveConversationTimelineToolComponent } from "./timeline-tool-registry";
import type { ConversationTimelineTools } from "./timeline-tool-types";
import { TypingIndicator } from "./typing-indicator";

// Helper to extract event part from timeline item
function extractEventPart(item: TimelineItem): TimelinePartEvent | null {
	if (item.type !== "event") {
		return null;
	}

	const eventPart = item.parts.find(
		(part): part is TimelinePartEvent => part.type === "event"
	);

	return eventPart || null;
}

export type {
	ConversationTimelineToolDefinition,
	ConversationTimelineToolProps,
	ConversationTimelineTools,
} from "./timeline-tool-types";

export type ConversationTimelineProps = {
	conversationId: string;
	items: TimelineItem[];
	className?: string;
	availableAIAgents: AvailableAIAgent[];
	availableHumanAgents: AvailableHumanAgent[];
	currentVisitorId?: string;
	tools?: ConversationTimelineTools;
	renderDaySeparator?: (props: {
		item: DaySeparatorItem;
		formatDate: (date: Date) => string;
	}) => React.ReactNode;
};

export const ConversationTimelineList: React.FC<ConversationTimelineProps> = ({
	conversationId,
	items: timelineItems,
	className,
	availableAIAgents = [],
	availableHumanAgents = [],
	currentVisitorId,
	tools,
	renderDaySeparator,
}) => {
	const timeline = useConversationTimeline({
		conversationId,
		items: timelineItems,
		currentVisitorId,
	});

	// Play typing sound when someone is typing
	useTypingSound(timeline.typingParticipants.length > 0, {
		volume: 1,
		playbackRate: 1.3,
	});

	return (
		<PrimitiveConversationTimeline
			autoScroll={true}
			className={cn(
				"overflow-y-scroll px-3 py-6",
				"co-scrollbar-thin",
				"h-full w-full",
				className
			)}
			id="conversation-timeline"
			items={timelineItems}
		>
			<ConversationTimelineContainer className="flex min-h-full w-full flex-col gap-5">
				{timeline.groupedMessages.items.map((item, index) => {
					if (item.type === "day_separator") {
						// Render day separator - allow custom rendering via prop
						if (renderDaySeparator) {
							return (
								<div key={`day-separator-${item.dateString}`}>
									{renderDaySeparator({
										item,
										formatDate: defaultFormatDate,
									})}
								</div>
							);
						}

						// Default day separator using the primitive
						return (
							<DaySeparator
								className="flex items-center justify-center py-2"
								date={item.date}
								dateString={item.dateString}
								key={`day-separator-${item.dateString}`}
							>
								{({ formattedDate }) => (
									<>
										<DaySeparatorLine className="flex-1 border-gray-300/20 border-t dark:border-gray-600/20" />
										<DaySeparatorLabel
											className="px-3 text-gray-400/50 text-xs dark:text-gray-500/50"
											formattedDate={formattedDate}
										/>
										<DaySeparatorLine className="flex-1 border-gray-300/20 border-t dark:border-gray-600/20" />
									</>
								)}
							</DaySeparator>
						);
					}

					if (item.type === "timeline_event") {
						// Extract event data from parts
						const eventPart = extractEventPart(item.item);

						// Only render if we have valid event data
						if (!eventPart) {
							return null;
						}

						return (
							<ConversationEvent
								availableAIAgents={availableAIAgents}
								availableHumanAgents={availableHumanAgents}
								createdAt={item.item.createdAt}
								event={eventPart}
								key={item.item.id ?? `timeline-event-${item.item.createdAt}`}
							/>
						);
					}

					if (item.type === "timeline_tool") {
						const toolName = item.tool ?? item.item.tool ?? item.item.type;
						const ToolComponent = resolveConversationTimelineToolComponent(
							toolName,
							tools
						);

						if (!ToolComponent) {
							return null;
						}

						const toolKey =
							item.item.id ?? `${toolName}-${item.item.createdAt}-${index}`;

						return (
							<ToolComponent
								conversationId={conversationId}
								item={item.item}
								key={toolKey}
								showTerminalIndicator={false}
							/>
						);
					}

					if (item.type === "activity_group") {
						const groupKey =
							item.firstItemId ??
							item.items?.[0]?.id ??
							`activity-group-${item.items?.[0]?.createdAt ?? index}`;

						return (
							<TimelineActivityGroup
								availableAIAgents={availableAIAgents}
								availableHumanAgents={availableHumanAgents}
								conversationId={conversationId}
								currentVisitorId={currentVisitorId}
								group={item}
								key={groupKey}
								tools={tools}
							/>
						);
					}

					// Use first timeline item ID as stable key
					const groupKey =
						item.lastMessageId ??
						item.items?.[0]?.id ??
						`group-${item.items?.[0]?.createdAt ?? index}`;

					return (
						<TimelineMessageGroup
							availableAIAgents={availableAIAgents}
							availableHumanAgents={availableHumanAgents}
							currentVisitorId={currentVisitorId}
							items={item.items || []}
							key={groupKey}
							lastReadMessageIds={timeline.groupedMessages.lastReadMessageMap}
							seenData={timeline.seenData}
						/>
					);
				})}
				<div className="w-full">
					{timeline.typingParticipants.length > 0 ? (
						<TypingIndicator
							availableAIAgents={availableAIAgents}
							availableHumanAgents={availableHumanAgents}
							className="mt-2"
							participants={timeline.typingParticipants}
						/>
					) : null}
				</div>
			</ConversationTimelineContainer>
		</PrimitiveConversationTimeline>
	);
};
