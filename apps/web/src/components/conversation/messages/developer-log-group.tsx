import type { RouterOutputs } from "@api/trpc/types";
import {
	TimelineItemGroup as PrimitiveTimelineItemGroup,
	TimelineItemGroupAvatar,
	TimelineItemGroupContent,
} from "@plasma/next/primitives";
import type { AvailableAIAgent } from "@plasma/types";
import { SenderType } from "@plasma/types";
import type { ConversationHeader } from "@/contexts/inboxes";
import type { DeveloperLogGroupRenderItem } from "./dashboard-timeline-render-items";
import {
	resolveDashboardTimelineSender,
	TimelineGroupSenderAvatar,
} from "./timeline-group-sender";
import { ToolCall } from "./tool-call";

type DeveloperLogGroupProps = {
	group: DeveloperLogGroupRenderItem;
	availableAIAgents: AvailableAIAgent[];
	teamMembers: RouterOutputs["user"]["getWebsiteMembers"];
	currentUserId?: string;
	visitor: ConversationHeader["visitor"];
};

export function DeveloperLogGroup({
	group,
	availableAIAgents,
	teamMembers,
	currentUserId,
	visitor,
}: DeveloperLogGroupProps) {
	const { senderDisplayName } = resolveDashboardTimelineSender({
		senderId: group.senderId,
		senderType: group.senderType,
		teamMembers,
		availableAIAgents,
		visitor,
	});

	return (
		<PrimitiveTimelineItemGroup
			items={group.items}
			viewerId={currentUserId}
			viewerType={SenderType.TEAM_MEMBER}
		>
			{() => (
				<div className="flex w-full flex-row gap-2">
					<TimelineItemGroupAvatar className="flex shrink-0 flex-col justify-start pt-0.5">
						<TimelineGroupSenderAvatar
							availableAIAgents={availableAIAgents}
							senderId={group.senderId}
							senderType={group.senderType}
							teamMembers={teamMembers}
							visitor={visitor}
						/>
					</TimelineItemGroupAvatar>

					<TimelineItemGroupContent className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
						<div className="flex items-center gap-2 px-1 text-muted-foreground text-xs">
							<span>{senderDisplayName}</span>
							<span className="rounded border border-primary/20 border-dashed px-1.5 py-0.5 font-medium uppercase tracking-wide">
								Dev logs
							</span>
						</div>

						<div className="flex min-w-0 flex-col gap-2">
							{group.items.map((item, index) => (
								<div
									className="w-full min-w-0"
									key={item.id ?? `developer-log-${item.createdAt}-${index}`}
								>
									<ToolCall item={item} mode="developer" showIcon={false} />
								</div>
							))}
						</div>
					</TimelineItemGroupContent>
				</div>
			)}
		</PrimitiveTimelineItemGroup>
	);
}
