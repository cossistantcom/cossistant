import type { ConversationRecord } from "@api/db/mutations/conversation";
import { realtime } from "@api/realtime/emitter";
import type { ConversationHeader } from "@plasma/types/trpc/conversation";

export type ConversationRealtimeActor =
	| { type: "visitor"; visitorId: string }
	| { type: "user"; userId: string }
	| { type: "ai_agent"; aiAgentId: string };

type BaseRealtimeContext = {
	conversation: ConversationRecord;
};

type SeenEventParams = BaseRealtimeContext & {
	actor: ConversationRealtimeActor;
	lastSeenAt: string;
};

type TypingEventParams = BaseRealtimeContext & {
	actor: ConversationRealtimeActor;
	isTyping: boolean;
	visitorPreview?: string | null;
};

type ConversationCreatedEventParams = {
	conversation: ConversationRecord;
	header: ConversationHeader;
};

function mapActor(actor: ConversationRealtimeActor) {
	switch (actor.type) {
		case "visitor":
			return {
				actorType: "visitor" as const,
				actorId: actor.visitorId,
				visitorId: actor.visitorId,
				userId: null,
				aiAgentId: null,
			};
		case "user":
			return {
				actorType: "user" as const,
				actorId: actor.userId,
				visitorId: null,
				userId: actor.userId,
				aiAgentId: null,
			};
		case "ai_agent":
			return {
				actorType: "ai_agent" as const,
				actorId: actor.aiAgentId,
				visitorId: null,
				userId: null,
				aiAgentId: actor.aiAgentId,
			};
		default:
			throw new Error("Unknown actor type");
	}
}

export async function emitConversationSeenEvent({
	conversation,
	actor,
	lastSeenAt,
}: SeenEventParams) {
	const actorPayload = mapActor(actor);

	// Use conversation's visitorId for routing so the event reaches the widget
	// The actor's visitorId is only non-null when a visitor is the one who "saw" the message
	// For AI agents/users, we still need to route to the conversation's visitor
	const visitorId = actorPayload.visitorId ?? conversation.visitorId ?? null;

	await realtime.emit("conversationSeen", {
		conversationId: conversation.id,
		organizationId: conversation.organizationId,
		websiteId: conversation.websiteId,
		lastSeenAt,
		...actorPayload,
		visitorId,
	});
}

export async function emitConversationTypingEvent({
	conversation,
	actor,
	isTyping,
	visitorPreview,
}: TypingEventParams) {
	const actorPayload = mapActor(actor);
	const previewForEvent =
		actor.type === "visitor" && isTyping && visitorPreview
			? visitorPreview.slice(0, 2000)
			: null;

	const visitorId = actorPayload.visitorId ?? conversation.visitorId ?? null;

	console.log(
		`[realtime:typing] conv=${conversation.id} | isTyping=${isTyping} | actor=${actorPayload.actorType} | visitorId=${visitorId}`
	);

	await realtime.emit("conversationTyping", {
		conversationId: conversation.id,
		websiteId: conversation.websiteId,
		organizationId: conversation.organizationId,
		isTyping,
		visitorPreview: previewForEvent,
		...actorPayload,
		visitorId,
	});
}

export async function emitConversationCreatedEvent({
	conversation,
	header,
}: ConversationCreatedEventParams) {
	await realtime.emit("conversationCreated", {
		conversationId: conversation.id,
		websiteId: conversation.websiteId,
		organizationId: conversation.organizationId,
		visitorId: conversation.visitorId ?? null,
		userId: null,
		conversation: {
			id: conversation.id,
			title: conversation.title ?? undefined,
			createdAt: conversation.createdAt,
			updatedAt: conversation.updatedAt,
			visitorId: conversation.visitorId,
			websiteId: conversation.websiteId,
			status: conversation.status,
			deletedAt: conversation.deletedAt ?? null,
			lastTimelineItem: header.lastTimelineItem ?? undefined,
		},
		header,
	});
}
