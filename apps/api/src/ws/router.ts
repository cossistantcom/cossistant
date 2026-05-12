import { markUserPresence, markVisitorPresence } from "@api/services/presence";
import type {
	AnyRealtimeEvent,
	RealtimeEvent,
	RealtimeEventType,
} from "@cossistant/types/realtime-events";

type DispatchOptions = {
	exclude?: string | string[];
};

type ConnectionDispatcher = (
	connectionId: string,
	event: AnyRealtimeEvent
) => void;

type VisitorDispatcher = (
	visitorId: string,
	event: AnyRealtimeEvent,
	options?: DispatchOptions
) => void;

type WebsiteDispatcher = (
	websiteId: string,
	event: AnyRealtimeEvent,
	options?: DispatchOptions
) => void;

type EventContext = {
	connectionId: string;
	userId?: string;
	visitorId?: string;
	visitorIds?: string[];
	websiteId?: string;
	organizationId?: string;
	ws?: WebSocket;
	sendToConnection?: ConnectionDispatcher;
	sendToVisitor?: VisitorDispatcher;
	sendToWebsite?: WebsiteDispatcher;
};

type EventHandler<T extends RealtimeEventType> = (
	ctx: EventContext,
	event: RealtimeEvent<T>
) => Promise<void> | void;

type EventHandlers = {
	[K in RealtimeEventType]: EventHandler<K>;
};

type WebsiteDispatchRule = boolean | { excludeConnection?: boolean };

type DispatchRule = {
	website: WebsiteDispatchRule;
	visitor: boolean;
};

type DispatchRuleOverrides = Partial<DispatchRule>;

const DEFAULT_DISPATCH_RULE: DispatchRule = {
	website: true,
	visitor: true,
};

const dispatchRules: Partial<Record<RealtimeEventType, DispatchRuleOverrides>> =
	{
		userConnected: { website: { excludeConnection: true }, visitor: false },
		userDisconnected: { website: { excludeConnection: true }, visitor: false },
		userPresenceUpdate: {
			website: { excludeConnection: true },
			visitor: false,
		},
		visitorPresenceUpdate: { website: true, visitor: false },
		visitorConnected: { website: true, visitor: false },
		visitorDisconnected: { website: true, visitor: false },
		conversationEventCreated: { website: true, visitor: true },
		conversationCreated: { website: true, visitor: true },
		conversationSeen: { website: true, visitor: true },
		conversationTyping: { website: true, visitor: true },
		timelineItemCreated: { website: true, visitor: true },
		visitorIdentified: { website: true, visitor: true },
		supportStateUpdated: { website: false, visitor: true },
		// Conversation updated events (title, sentiment, escalation)
		conversationUpdated: { website: true, visitor: true },
		// Web crawling events - only dispatch to website (dashboard users)
		crawlStarted: { website: true, visitor: false },
		crawlProgress: { website: true, visitor: false },
		crawlCompleted: { website: true, visitor: false },
		crawlFailed: { website: true, visitor: false },
		linkSourceUpdated: { website: true, visitor: false },
		crawlPagesDiscovered: { website: true, visitor: false },
		crawlPageCompleted: { website: true, visitor: false },
		// AI agent processing events
		// These use audience filtering: 'all' goes to both, 'dashboard' goes only to website
		aiAgentProcessingStarted: { website: true, visitor: true },
		aiAgentDecisionMade: { website: true, visitor: true },
		aiAgentProcessingProgress: { website: true, visitor: true },
		aiAgentProcessingCompleted: { website: true, visitor: true },
		// Timeline item update events
		timelineItemUpdated: { website: true, visitor: true },
		timelineItemPartUpdated: { website: true, visitor: true },
		// AI training events - only dispatch to website (dashboard users)
		trainingStarted: { website: true, visitor: false },
		trainingProgress: { website: true, visitor: false },
		trainingCompleted: { website: true, visitor: false },
		trainingFailed: { website: true, visitor: false },
	};

function resolveWebsiteDispatchOptions(
	rule: WebsiteDispatchRule | undefined,
	ctx: EventContext
): DispatchOptions | undefined {
	if (!rule) {
		return;
	}

	if (typeof rule === "boolean") {
		return;
	}

	if (rule.excludeConnection && ctx.connectionId) {
		return { exclude: ctx.connectionId } satisfies DispatchOptions;
	}

	return;
}

/**
 * Check if an event should be sent to visitors based on audience and visibility fields.
 * - AI agent events use audience filtering: 'all' goes to both, 'dashboard' goes only to website
 * - Timeline item events with visibility "private" are never sent to visitors
 */
function shouldSendToVisitor<T extends RealtimeEventType>(
	event: RealtimeEvent<T>
): boolean {
	const payload = event.payload as Record<string, unknown>;

	// If the event has an audience field and it's 'dashboard', don't send to visitor
	if ("audience" in payload && payload.audience === "dashboard") {
		return false;
	}

	// Keep dashboard-only pause controls private to team members.
	if (event.type === "conversationUpdated") {
		const updates = (
			payload as {
				updates?: {
					aiPausedUntil?: string | null;
					activeClarification?: unknown;
				};
			}
		).updates;
		if (
			updates &&
			("aiPausedUntil" in updates || "activeClarification" in updates)
		) {
			return false;
		}
	}

	// Never send private timeline items to visitors
	if ("item" in payload) {
		const item = payload.item as Record<string, unknown> | undefined;
		if (item && "visibility" in item && item.visibility === "private") {
			return false;
		}

		// Tool timeline rows are visitor-visible only when explicitly public.
		if (
			item &&
			"type" in item &&
			item.type === "tool" &&
			(!("visibility" in item) || item.visibility !== "public")
		) {
			return false;
		}
	}

	return true;
}

function dispatchEvent<T extends RealtimeEventType>(
	ctx: EventContext,
	event: RealtimeEvent<T>,
	rules: DispatchRule
): void {
	const websiteTarget = event.payload.websiteId ?? ctx.websiteId;
	if (websiteTarget && ctx.sendToWebsite && rules.website) {
		const options = resolveWebsiteDispatchOptions(rules.website, ctx);
		ctx.sendToWebsite(websiteTarget, event as AnyRealtimeEvent, options);
	}

	const visitorTarget = event.payload.visitorId ?? ctx.visitorId;
	const hasExplicitVisitorTargets = Boolean(ctx.visitorIds?.length);
	const visitorTargets = hasExplicitVisitorTargets
		? [...new Set(ctx.visitorIds)]
		: visitorTarget
			? [visitorTarget]
			: [];

	// Check audience filter before sending to visitor
	if (
		rules.visitor &&
		visitorTargets.length > 0 &&
		ctx.sendToVisitor &&
		shouldSendToVisitor(event)
	) {
		for (const targetVisitorId of visitorTargets) {
			ctx.sendToVisitor(
				targetVisitorId,
				hasExplicitVisitorTargets
					? cloneEventForVisitorTarget(event, targetVisitorId)
					: (event as AnyRealtimeEvent)
			);
		}
	}
}

function cloneEventForVisitorTarget<T extends RealtimeEventType>(
	event: RealtimeEvent<T>,
	visitorId: string
): AnyRealtimeEvent {
	if (event.payload.visitorId === visitorId) {
		return event as AnyRealtimeEvent;
	}

	return {
		...event,
		payload: {
			...event.payload,
			visitorId,
		},
	} as AnyRealtimeEvent;
}

/**
 * Event handlers for each realtime event type
 * Each handler receives context, the full event payload, and forwards it to
 * relevant local connections using the provided dispatch helpers.
 */
const eventHandlers: EventHandlers = {
	userConnected: async (_ctx, event) => {
		const data = event.payload;
		const lastSeenAt = new Date().toISOString();

		if (!data.userId) {
			return;
		}

		void markUserPresence({
			websiteId: data.websiteId,
			userId: data.userId,
			lastSeenAt,
		});
	},

	userDisconnected: async (_ctx, event) => {
		const data = event.payload;
		const lastSeenAt = new Date().toISOString();

		if (!data.userId) {
			return;
		}

		void markUserPresence({
			websiteId: data.websiteId,
			userId: data.userId,
			lastSeenAt,
		});
	},

	visitorConnected: async (_ctx, event) => {
		const data = event.payload;
		const lastSeenAt = new Date().toISOString();

		void markVisitorPresence({
			websiteId: data.websiteId,
			visitorId: data.visitorId,
			lastSeenAt,
		});
	},

	visitorDisconnected: async (_ctx, event) => {
		const data = event.payload;
		const lastSeenAt = new Date().toISOString();

		void markVisitorPresence({
			websiteId: data.websiteId,
			visitorId: data.visitorId,
			lastSeenAt,
		});
	},

	visitorPresenceUpdate: (_ctx, event) => {
		const _data = event.payload;
	},

	userPresenceUpdate: (_ctx, event) => {
		const _data = event.payload;
	},

	timelineItemCreated: (_ctx, event) => {
		const _data = event.payload;
	},

	conversationSeen: (_ctx, event) => {
		const _data = event.payload;
	},

	conversationTyping: (_ctx, event) => {
		const _data = event.payload;
	},

	conversationEventCreated: (_ctx, event) => {
		const _data = event.payload;
	},

	conversationCreated: (_ctx, event) => {
		const _data = event.payload;
	},
	visitorIdentified: (_ctx, event) => {
		const _data = event.payload;
	},
	supportStateUpdated: (_ctx, event) => {
		const _data = event.payload;
	},
	// Conversation updated (title, sentiment, escalation)
	conversationUpdated: (_ctx, event) => {
		const _data = event.payload;
		// Event is broadcast to website and visitor - no additional logic needed
	},
	// Web crawling event handlers
	crawlStarted: (_ctx, event) => {
		const _data = event.payload;
		// Event is broadcast to website - no additional logic needed
	},
	crawlProgress: (_ctx, event) => {
		const _data = event.payload;
		// Event is broadcast to website - no additional logic needed
	},
	crawlCompleted: (_ctx, event) => {
		const _data = event.payload;
		// Event is broadcast to website - no additional logic needed
	},
	crawlFailed: (_ctx, event) => {
		const _data = event.payload;
		// Event is broadcast to website - no additional logic needed
	},
	linkSourceUpdated: (_ctx, event) => {
		const _data = event.payload;
		// Event is broadcast to website - no additional logic needed
	},
	crawlPagesDiscovered: (_ctx, event) => {
		const _data = event.payload;
		// Event is broadcast to website - no additional logic needed
	},
	crawlPageCompleted: (_ctx, event) => {
		const _data = event.payload;
		// Event is broadcast to website - no additional logic needed
	},
	// AI agent processing events
	// These use audience filtering: 'all' goes to both, 'dashboard' goes only to website
	aiAgentProcessingStarted: (_ctx, event) => {
		const _data = event.payload;
		// Event is broadcast based on audience field
	},
	aiAgentDecisionMade: (_ctx, event) => {
		const _data = event.payload;
		// Event is broadcast based on audience field
		// shouldAct=true → audience='all' (widget shows typing)
		// shouldAct=false → audience='dashboard' (visitor doesn't know)
	},
	aiAgentProcessingProgress: (_ctx, event) => {
		const _data = event.payload;
		// Event is broadcast based on audience field
	},
	aiAgentProcessingCompleted: (_ctx, event) => {
		const _data = event.payload;
		// Event is broadcast based on audience field
	},
	// Timeline item update events
	timelineItemUpdated: (_ctx, event) => {
		const _data = event.payload;
		// Event is broadcast to website and visitor - no additional logic needed
	},
	timelineItemPartUpdated: (_ctx, event) => {
		const _data = event.payload;
		// Event is broadcast to website and visitor - no additional logic needed
	},
	// AI training event handlers
	trainingStarted: (_ctx, event) => {
		const _data = event.payload;
		// Event is broadcast to website - no additional logic needed
	},
	trainingProgress: (_ctx, event) => {
		const _data = event.payload;
		// Event is broadcast to website - no additional logic needed
	},
	trainingCompleted: (_ctx, event) => {
		const _data = event.payload;
		// Event is broadcast to website - no additional logic needed
	},
	trainingFailed: (_ctx, event) => {
		const _data = event.payload;
		// Event is broadcast to website - no additional logic needed
	},
};

/**
 * Routes an event to its appropriate handler
 */
export async function routeEvent<T extends RealtimeEventType>(
	event: RealtimeEvent<T>,
	context: EventContext
): Promise<void> {
	const handler = eventHandlers[event.type] as EventHandler<T>;

	if (!handler) {
		console.error(
			`[EventRouter] No handler found for event type: ${event.type}`
		);
		return;
	}

	try {
		await handler(context, event);
	} catch (error) {
		console.error(`[EventRouter] Error handling ${event.type}:`, error);
	}

	const overrides = dispatchRules[event.type];
	const rules: DispatchRule = {
		website: overrides?.website ?? DEFAULT_DISPATCH_RULE.website,
		visitor: overrides?.visitor ?? DEFAULT_DISPATCH_RULE.visitor,
	};

	dispatchEvent(context, event, rules);
}

export type {
	ConnectionDispatcher,
	DispatchOptions,
	EventContext,
	EventHandler,
	VisitorDispatcher,
	WebsiteDispatcher,
};
