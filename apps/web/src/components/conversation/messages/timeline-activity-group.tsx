import type { RouterOutputs } from "@api/trpc/types";
import type { GroupedActivity } from "@plasma/next/hooks";
import {
	TimelineItemGroup as PrimitiveTimelineItemGroup,
	TimelineItemGroupAvatar,
	TimelineItemGroupContent,
} from "@plasma/next/primitives";
import type { AvailableAIAgent } from "@plasma/types";
import { SenderType } from "@plasma/types";
import type {
	TimelineItem,
	TimelinePartEvent,
} from "@plasma/types/api/timeline-item";
import { useMemo } from "react";
import type { ConversationHeader } from "@/contexts/inboxes";
import { extractEventPart } from "@/lib/timeline-events";
import { isCustomerFacingToolTimelineItem } from "@/lib/tool-timeline-visibility";
import type { PublicActivityGroupRenderItem } from "./dashboard-timeline-render-items";
import { ConversationEvent } from "./event";
import {
	resolveDashboardTimelineSender,
	TimelineGroupSenderAvatar,
} from "./timeline-group-sender";
import { ToolCall } from "./tool-call";

type TimelineActivityGroupProps = {
	group: GroupedActivity | PublicActivityGroupRenderItem;
	availableAIAgents: AvailableAIAgent[];
	teamMembers: RouterOutputs["user"]["getWebsiteMembers"];
	currentUserId?: string;
	visitor: ConversationHeader["visitor"];
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
	  };

export function TimelineActivityGroup({
	group,
	availableAIAgents,
	teamMembers,
	currentUserId,
	visitor,
}: TimelineActivityGroupProps) {
	const availableHumanAgents = useMemo(
		() =>
			teamMembers.map((member) => {
				const memberDisplay = resolveDashboardTimelineSender({
					availableAIAgents,
					senderId: member.id,
					senderType: SenderType.TEAM_MEMBER,
					teamMembers,
					visitor,
				});

				return {
					id: member.id,
					name: memberDisplay.senderDisplayName,
					image: member.image,
					lastSeenAt: member.lastSeenAt,
				};
			}),
		[availableAIAgents, teamMembers, visitor]
	);

	const { senderDisplayName } = resolveDashboardTimelineSender({
		senderId: group.senderId,
		senderType: group.senderType,
		teamMembers,
		availableAIAgents,
		visitor,
	});

	const activityRows = useMemo(() => {
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
				if (!isCustomerFacingToolTimelineItem(item)) {
					continue;
				}

				rows.push({
					type: "tool",
					key: item.id ?? `activity-tool-${item.createdAt}-${index}`,
					item,
				});
			}
		}

		return rows;
	}, [group.items]);

	if (activityRows.length === 0) {
		return null;
	}
	const hasToolRows = activityRows.some((row) => row.type === "tool");
	const hasSingleVisibleToolRow =
		activityRows.length === 1 && activityRows[0]?.type === "tool";
	const hasMultipleVisibleRows = activityRows.length > 1;
	const isMultiEventOnlyGroup = hasMultipleVisibleRows && !hasToolRows;
	const showSenderLabel = hasToolRows || isMultiEventOnlyGroup;

	return (
		<PrimitiveTimelineItemGroup
			items={group.items}
			viewerId={currentUserId}
			viewerType={SenderType.TEAM_MEMBER}
		>
			{() => (
				<div
					className="flex w-full flex-row gap-2"
					data-activity-group-layout={
						hasSingleVisibleToolRow ? "single-tool" : "stacked"
					}
				>
					<TimelineItemGroupAvatar
						className={
							hasSingleVisibleToolRow
								? "flex shrink-0 flex-col justify-start pt-6"
								: "flex shrink-0 flex-col justify-start pt-1"
						}
					>
						<TimelineGroupSenderAvatar
							availableAIAgents={availableAIAgents}
							senderId={group.senderId}
							senderType={group.senderType}
							teamMembers={teamMembers}
							visitor={visitor}
						/>
					</TimelineItemGroupAvatar>

					<TimelineItemGroupContent
						className={
							hasSingleVisibleToolRow
								? "flex min-w-0 flex-1 flex-col gap-1 pt-0.5"
								: "flex min-w-0 flex-1 flex-col gap-1 pt-1"
						}
					>
						<div className="flex w-full min-w-0 flex-col gap-1">
							{showSenderLabel ? (
								<div
									className="px-1 pt-1.5 text-muted-foreground text-xs leading-4"
									data-activity-group-sender-label="true"
								>
									{senderDisplayName}
								</div>
							) : null}
							{activityRows.map((row) => (
								<div className="w-full min-w-0" key={row.key}>
									{row.type === "event" ? (
										<ConversationEvent
											availableAIAgents={availableAIAgents}
											availableHumanAgents={availableHumanAgents}
											createdAt={row.item.createdAt}
											event={row.event}
											showActorName={!isMultiEventOnlyGroup}
											showIcon={false}
											showTerminalIndicator={hasMultipleVisibleRows}
											visitor={visitor}
										/>
									) : (
										<ToolCall
											item={row.item}
											mode="default"
											showIcon={false}
											showTerminalIndicator={true}
										/>
									)}
								</div>
							))}
						</div>
					</TimelineItemGroupContent>
				</div>
			)}
		</PrimitiveTimelineItemGroup>
	);
}
