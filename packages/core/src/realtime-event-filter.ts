import type { AnyRealtimeEvent } from "@plasma/types/realtime-events";

function getTargetVisitorId(event: AnyRealtimeEvent): string | null {
	const payloadVisitorId = event.payload.visitorId;

	if (typeof payloadVisitorId === "string" && payloadVisitorId.length > 0) {
		return payloadVisitorId;
	}

	if (
		event.type === "timelineItemCreated" ||
		event.type === "timelineItemUpdated"
	) {
		const itemVisitorId = event.payload.item.visitorId;

		if (typeof itemVisitorId === "string" && itemVisitorId.length > 0) {
			return itemVisitorId;
		}
	}

	return null;
}

/**
 * Determines whether a realtime event should be processed based on website and
 * visitor identifiers.
 *
 * When a visitorId is provided (i.e. the consumer is a visitor/widget), private
 * timeline items are filtered out to prevent leaking internal data.
 */
export function shouldDeliverEvent(
	event: AnyRealtimeEvent,
	websiteId: string | null,
	visitorId: string | null
): boolean {
	if (websiteId && event.payload.websiteId !== websiteId) {
		return false;
	}

	// When consuming as a visitor, never deliver private/non-public tool timeline items.
	// This is a defense-in-depth measure; the server should also filter these.
	if (visitorId && isBlockedTimelineEventForVisitor(event)) {
		return false;
	}

	if (!visitorId) {
		return true;
	}

	const targetVisitorId = getTargetVisitorId(event);

	if (targetVisitorId && targetVisitorId !== visitorId) {
		return false;
	}

	return true;
}

/**
 * Returns true if the event carries a blocked timeline item for visitor delivery.
 */
function isBlockedTimelineEventForVisitor(event: AnyRealtimeEvent): boolean {
	if (
		event.type === "timelineItemCreated" ||
		event.type === "timelineItemUpdated"
	) {
		const payload = event.payload as Record<string, unknown>;
		const item = payload.item as Record<string, unknown> | undefined;
		if (item && item.visibility === "private") {
			return true;
		}
		if (
			item &&
			item.type === "tool" &&
			(!("visibility" in item) || item.visibility !== "public")
		) {
			return true;
		}
	}
	return false;
}

export { getTargetVisitorId };
