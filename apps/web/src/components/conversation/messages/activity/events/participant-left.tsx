import type { ActivityIcon } from "../activity-wrapper";
import { ActivityWrapper } from "../activity-wrapper";
import type { EventActivityProps } from "../types";

function resolveEventIcon(event: EventActivityProps["event"]): ActivityIcon {
	if (event.actorType === "ai") {
		return event.actorImage
			? {
					type: "avatar",
					name: event.actorName,
					image: event.actorImage,
				}
			: { type: "logo" };
	}
	return {
		type: "avatar",
		name: event.actorName,
		image: event.actorImage,
	};
}

export function ParticipantLeftActivity({
	event,
	timestamp,
	showIcon = true,
	showActorName = true,
	showTerminalIndicator = false,
}: EventActivityProps) {
	const text = showActorName ? (
		<>
			<span className="font-semibold">{event.actorName}</span> left the
			conversation
		</>
	) : (
		"left the conversation"
	);

	return (
		<ActivityWrapper
			icon={resolveEventIcon(event)}
			showIcon={showIcon}
			showTerminalIndicator={showTerminalIndicator}
			state="result"
			text={text}
			timestamp={timestamp}
		/>
	);
}
