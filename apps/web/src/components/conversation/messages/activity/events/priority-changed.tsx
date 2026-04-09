import { cn } from "@/lib/utils";
import type { ActivityIcon } from "../activity-wrapper";
import { ActivityWrapper } from "../activity-wrapper";
import type { EventActivityProps } from "../types";

const priorityColor: Record<string, string> = {
	urgent: "text-destructive font-semibold",
};

function extractPriorityFromMessage(
	message: string | null | undefined
): string | null {
	if (!message) {
		return null;
	}
	const match = message.match(/priority\s+(?:to\s+)?(\w+)/i);
	return match?.[1] ?? null;
}

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

export function PriorityChangedActivity({
	event,
	timestamp,
	showIcon = true,
	showActorName = true,
	showTerminalIndicator = false,
}: EventActivityProps) {
	const priority = extractPriorityFromMessage(event.message);
	const colorClass = priority
		? (priorityColor[priority.toLowerCase()] ?? "")
		: "";

	const text = priority ? (
		<>
			{showActorName ? (
				<span className="font-semibold">{event.actorName}</span>
			) : null}
			{showActorName ? " changed priority to " : "changed priority to "}
			<span className={cn(colorClass)}>{priority}</span>
		</>
	) : showActorName ? (
		<>
			<span className="font-semibold">{event.actorName}</span>{" "}
			{event.actionText}
		</>
	) : (
		event.actionText
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
