import { ConversationTimelineType, type TimelineItem } from "@plasma/types";

export function isInboundVisitorMessage(
	timelineItem: TimelineItem | null | undefined
): timelineItem is TimelineItem & {
	type: typeof ConversationTimelineType.MESSAGE;
} {
	return (
		timelineItem != null &&
		timelineItem.type === ConversationTimelineType.MESSAGE &&
		!!timelineItem.visitorId &&
		!timelineItem.userId &&
		!timelineItem.aiAgentId
	);
}
