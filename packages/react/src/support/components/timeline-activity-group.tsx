import type {
	TimelineItem,
	TimelinePartEvent,
} from "@cossistant/types/api/timeline-item";
import type {
	AvailableAIAgent,
	AvailableHumanAgent,
	TimelinePartEvent,
} from "@plasma/types";
import { SenderType } from "@plasma/types";
import type { TimelineItem } from "@plasma/types/api/timeline-item";
import type React from "react";
import { useMemo } from "react";
import type { GroupedActivity } from "../../hooks/private/use-grouped-messages";
import {
	TimelineItemGroup as PrimitiveTimelineItemGroup,
	TimelineItemGroupAvatar,
	TimelineItemGroupContent,
} from "../../primitives/timeline-item-group";
import { getToolNameFromTimelineItem } from "../../utils/timeline-tool";
import { useSupportText } from "../text";
import { resolveSupportHumanAgentDisplay } from "../utils/human-agent-display";
import { Avatar } from "./avatar";
import { ConversationEvent } from "./conversation-event";
import { resolveConversationTimelineToolComponent } from "./timeline-tool-registry";
import type { ConversationTimelineTools } from "./timeline-tool-types";

type TimelineActivityGroupProps = {
	group: GroupedActivity;
	conversationId: string;
	availableAIAgents: AvailableAIAgent[];
	availableHumanAgents: AvailableHumanAgent[];
	currentVisitorId?: string;
	tools?: ConversationTimelineTools;
};

type ActivityRow =
	| {
			type: "event";
			key: string;
			item: TimelineItem;
			event: TimelinePartEvent;
	  }
	| {
			type: "tool";
			key: string;
			item: TimelineItem;
			ToolComponent: React.ComponentType<{
				item: TimelineItem;
				conversationId: string;
				showTerminalIndicator?: boolean;
			}>;
	  };

function extractEventPart(item: TimelineItem): TimelinePartEvent | null {
	if (item.type !== "event") {
		return null;
	}

	const eventPart = item.parts.find(
		(part): part is TimelinePartEvent => part.type === "event"
	);

	return eventPart || null;
}

export const TimelineActivityGroup: React.FC<TimelineActivityGroupProps> = ({
	group,
	conversationId,
	availableAIAgents,
	availableHumanAgents,
	currentVisitorId,
	tools,
}) => {
	const text = useSupportText();
	const activityRows = useMemo<ActivityRow[]>(() => {
		const rows: ActivityRow[] = [];

		for (let index = 0; index < group.items.length; index++) {
			const item = group.items[index];
			if (!item) {
				continue;
			}

			if (item.type === "event") {
				const eventPart = extractEventPart(item);
				if (!eventPart) {
					continue;
				}

				rows.push({
					type: "event",
					key: item.id ?? `activity-event-${item.createdAt}-${index}`,
					item,
					event: eventPart,
				});
				continue;
			}

			if (item.type === "tool") {
				const toolName = getToolNameFromTimelineItem(item);
				if (!toolName) {
					continue;
				}

				const ToolComponent = resolveConversationTimelineToolComponent(
					toolName,
					tools
				);
				if (!ToolComponent) {
					continue;
				}

				rows.push({
					type: "tool",
					key: item.id ?? `activity-tool-${item.createdAt}-${index}`,
					item,
					ToolComponent,
				});
			}
		}

		return rows;
	}, [group.items, tools]);

	if (activityRows.length === 0) {
		return null;
	}
	const toolRowCount = activityRows.filter((row) => row.type === "tool").length;

	const humanAgent = availableHumanAgents.find(
		(agent) => agent.id === group.senderId
	);
	const aiAgent = availableAIAgents.find(
		(agent) => agent.id === group.senderId
	);
	const humanDisplay = resolveSupportHumanAgentDisplay(
		humanAgent,
		text("common.fallbacks.supportTeam")
	);

	return (
		<PrimitiveTimelineItemGroup
			items={group.items}
			viewerId={currentVisitorId}
			viewerType={SenderType.VISITOR}
		>
			{({ isAI, isTeamMember }) => (
				<div className="flex w-full flex-row gap-2">
					<TimelineItemGroupAvatar className="flex shrink-0 flex-col justify-start">
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
								name={isTeamMember ? humanDisplay.displayName : "Visitor"}
							/>
						)}
					</TimelineItemGroupAvatar>

					<TimelineItemGroupContent className="flex min-w-0 flex-1 flex-col gap-1">
						<div className="flex w-full min-w-0 flex-col gap-2">
							{activityRows.map((row) => {
								if (row.type === "event") {
									return (
										<ConversationEvent
											availableAIAgents={availableAIAgents}
											availableHumanAgents={availableHumanAgents}
											className="w-full"
											compact
											createdAt={row.item.createdAt}
											event={row.event}
											key={row.key}
											showAvatar={false}
										/>
									);
								}

								const ToolComponent = row.ToolComponent;
								return (
									<div className="w-full" key={row.key}>
										<ToolComponent
											conversationId={conversationId}
											item={row.item}
											showTerminalIndicator={toolRowCount > 1}
										/>
									</div>
								);
							})}
						</div>
					</TimelineItemGroupContent>
				</div>
			)}
		</PrimitiveTimelineItemGroup>
	);
};

TimelineActivityGroup.displayName = "TimelineActivityGroup";
