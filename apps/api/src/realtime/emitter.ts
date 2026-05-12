import { db as defaultDb } from "@api/db";
import { getConversationDeliveryVisitorIds } from "@api/db/queries/conversation-access";
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
} from "@cossistant/types/realtime-events";

type RealtimeEmitOptions = {
	visitorIds?: string[];
};

const CONTACT_SCOPED_VISITOR_EVENT_TYPES = new Set<RealtimeEventType>([
	"aiAgentProcessingStarted",
	"aiAgentProcessingProgress",
	"aiAgentProcessingCompleted",
	"conversationUpdated",
	"timelineItemCreated",
	"timelineItemUpdated",
	"timelineItemPartUpdated",
]);

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
		payload: RealtimeEventData<TType>,
		options: RealtimeEmitOptions = {}
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
		const visitorIds = await resolveVisitorDeliveryTargets({
			type,
			organizationId,
			websiteId,
			visitorId: event.payload.visitorId ?? undefined,
			visitorIds: options.visitorIds,
		});

		const context: EventContext = {
			connectionId: "server",
			websiteId,
			visitorId: event.payload.visitorId ?? undefined,
			visitorIds,
			userId: payload.userId ?? undefined,
			organizationId,
			sendToConnection: sendEventToConnection,
			sendToVisitor: sendEventToVisitor,
			sendToWebsite: sendEventToWebsite,
		};

		await routeEvent(event, context);
	}
}

async function resolveVisitorDeliveryTargets(params: {
	type: RealtimeEventType;
	organizationId: string;
	websiteId: string;
	visitorId?: string | null;
	visitorIds?: string[];
}): Promise<string[] | undefined> {
	if (params.visitorIds) {
		return normalizeVisitorIds(params.visitorIds);
	}

	if (
		!(params.visitorId && CONTACT_SCOPED_VISITOR_EVENT_TYPES.has(params.type))
	) {
		return;
	}

	try {
		const visitorIds = await getConversationDeliveryVisitorIds(defaultDb, {
			organizationId: params.organizationId,
			websiteId: params.websiteId,
			conversationVisitorId: params.visitorId,
		});

		return normalizeVisitorIds(visitorIds);
	} catch (error) {
		console.warn("[realtime] Failed to resolve contact-scoped visitors", {
			error,
			type: params.type,
			organizationId: params.organizationId,
			websiteId: params.websiteId,
			visitorId: params.visitorId,
		});
		return [params.visitorId];
	}
}

function normalizeVisitorIds(visitorIds: string[]): string[] | undefined {
	const normalized = [
		...new Set(visitorIds.map((id) => id.trim()).filter(Boolean)),
	];

	return normalized.length > 0 ? normalized : undefined;
}

export const realtime = new RealtimeEmitter();
