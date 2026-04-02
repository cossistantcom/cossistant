import { type EventContext, routeEvent } from "@api/ws/router";
import {
	sendEventToConnection,
	sendEventToVisitor,
	sendEventToWebsite,
} from "@api/ws/socket";
import {
	type RealtimeEvent,
	type RealtimeEventData,
	type RealtimeEventType,
	validateRealtimeEvent,
} from "@plasma/types/realtime-events";

function extractWebsiteId(data: unknown): string | null {
	if (!data || typeof data !== "object") {
		return null;
	}

	if ("websiteId" in data) {
		const value = (data as { websiteId?: unknown }).websiteId;
		if (typeof value === "string" && value.length > 0) {
			return value;
		}
	}

	return null;
}

function extractOrganizationId(data: unknown): string | null {
	if (!data || typeof data !== "object") {
		return null;
	}

	if ("organizationId" in data) {
		const value = (data as { organizationId?: unknown }).organizationId;
		if (typeof value === "string" && value.length > 0) {
			return value;
		}
	}

	return null;
}

export class RealtimeEmitter {
	async emit<TType extends RealtimeEventType>(
		type: TType,
		payload: RealtimeEventData<TType>
	): Promise<void> {
		const data = validateRealtimeEvent(type, payload);
		const websiteId = payload.websiteId ?? extractWebsiteId(data);
		const organizationId =
			payload.organizationId ?? extractOrganizationId(data) ?? null;

		if (!websiteId) {
			throw new Error(
				`Realtime event "${type}" is missing websiteId. Pass it explicitly or include it in the payload.`
			);
		}

		if (!organizationId) {
			throw new Error(
				`Realtime event "${type}" is missing organizationId. Pass it explicitly or include it in the payload.`
			);
		}

		const event: RealtimeEvent<TType> = {
			type,
			payload: data,
		};

		const context: EventContext = {
			connectionId: "server",
			websiteId,
			visitorId: event.payload.visitorId ?? undefined,
			userId: payload.userId ?? undefined,
			organizationId,
			sendToConnection: sendEventToConnection,
			sendToVisitor: sendEventToVisitor,
			sendToWebsite: sendEventToWebsite,
		};

		await routeEvent(event, context);
	}
}

export const realtime = new RealtimeEmitter();
