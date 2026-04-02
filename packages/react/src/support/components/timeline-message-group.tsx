import type { AvailableAIAgent, AvailableHumanAgent } from "@plasma/types";
import { SenderType } from "@plasma/types";
import type { TimelineItem } from "@plasma/types/api/timeline-item";
import type { ConversationSeen } from "@plasma/types/schemas";
import type React from "react";
import {
	TimelineItemGroup as PrimitiveTimelineItemGroup,
	TimelineItemGroupAvatar,
	TimelineItemGroupContent,
	TimelineItemGroupHeader,
} from "../../primitives/timeline-item-group";
import { useSupportText } from "../text";
import { cn } from "../utils";
import { resolveSupportHumanAgentDisplay } from "../utils/human-agent-display";
import { Avatar } from "./avatar";
import { ReadIndicator } from "./read-indicator";
import { TimelineMessageItem } from "./timeline-message-item";

export type TimelineMessageGroupProps = {
	items: TimelineItem[];
	availableAIAgents: AvailableAIAgent[];
	availableHumanAgents: AvailableHumanAgent[];
	currentVisitorId?: string;
	lastReadMessageIds?: Map<string, string>;
	seenData?: ConversationSeen[];
};

export const TimelineMessageGroup: React.FC<TimelineMessageGroupProps> = ({
	items,
	availableAIAgents,
	availableHumanAgents,
	currentVisitorId,
	lastReadMessageIds,
	seenData = [],
}) => {
	const text = useSupportText();
	// Get agent info for the sender
	const firstItem = items[0];
	const humanAgent = availableHumanAgents.find(
		(agent) => agent.id === firstItem?.userId
	);
	const aiAgent = availableAIAgents.find(
		(agent) => agent.id === firstItem?.aiAgentId
	);

	if (items.length === 0) {
		return null;
	}

	const humanDisplay = resolveSupportHumanAgentDisplay(
		humanAgent,
		text("common.fallbacks.supportTeam")
	);
	const lastItem = items.at(-1);

	return (
		<PrimitiveTimelineItemGroup
			items={items}
			lastReadItemIds={lastReadMessageIds}
			viewerId={currentVisitorId}
			viewerType={SenderType.VISITOR}
		>
			{({ isSentByViewer, isReceivedByViewer, isAI }) => (
				<>
					<div
						className={cn(
							"flex w-full gap-2",
							// Support widget POV: visitor messages are sent (right side)
							// Agent messages are received (left side)
							isSentByViewer && "flex-row-reverse",
							isReceivedByViewer && "flex-row"
						)}
					>
						{/* Avatar - only show for received messages (agents) */}
						{isReceivedByViewer && (
							<TimelineItemGroupAvatar className="flex flex-shrink-0 flex-col justify-end">
								{isAI ? (
									<Avatar
										className="size-6"
										image={aiAgent?.image}
										isAI
										name={aiAgent?.name || "AI Assistant"}
										showBackground={!!aiAgent?.image}
									/>
								) : (
									<Avatar
										className="size-6"
										facehashSeed={humanDisplay.facehashSeed}
										image={humanAgent?.image}
										name={humanDisplay.displayName}
									/>
								)}
							</TimelineItemGroupAvatar>
						)}

						<TimelineItemGroupContent
							className={cn(
								"flex min-w-0 flex-1 flex-col gap-1",
								isSentByViewer && "items-end"
							)}
						>
							{/* Header - show sender name for received messages (agents) */}
							{isReceivedByViewer && (
								<TimelineItemGroupHeader className="px-1 text-co-muted-foreground text-xs">
									{isAI
										? aiAgent?.name || "AI Assistant"
										: humanDisplay.displayName}
								</TimelineItemGroupHeader>
							)}

							{items.map((item, index) => (
								<div className="co-animate-slide-up-fade w-full" key={item.id}>
									<TimelineMessageItem
										isLast={index === items.length - 1}
										isSentByViewer={isSentByViewer}
										item={item}
									/>
								</div>
							))}
						</TimelineItemGroupContent>
					</div>

					{lastItem?.id ? (
						<ReadIndicator
							availableAIAgents={availableAIAgents}
							availableHumanAgents={availableHumanAgents}
							currentVisitorId={currentVisitorId}
							firstMessage={firstItem}
							lastReadMessageIds={lastReadMessageIds}
							messageId={lastItem.id}
							seenData={seenData}
						/>
					) : null}
				</>
			)}
		</PrimitiveTimelineItemGroup>
	);
};

TimelineMessageGroup.displayName = "TimelineMessageGroup";
