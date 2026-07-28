import { beforeEach, describe, expect, it, mock } from "bun:test";
import * as schema from "@api/db/schema";
import type { AnyRealtimeEvent } from "@cossistant/types/realtime-events";
import type { EventContext } from "./router";
import type { RawSocket } from "./socket";

const routeEventCalls: [AnyRealtimeEvent, EventContext][] = [];

mock.module("@api/db", () => ({ db: {} }));
mock.module("@api/db/queries/api-keys", () => ({}));
mock.module("@api/db/queries/conversation", () => ({
	getConversationById: async () => ({
		id: "conv-1",
		websiteId: "website-1",
		visitorId: "visitor-1",
	}),
}));
mock.module("@api/db/queries/session", () => ({
	normalizeSessionToken: (token: string | null | undefined) =>
		token?.trim() || undefined,
	resolveSession: async () => null,
}));
mock.module("@api/db/queries/website", () => ({
	getWebsiteByIdWithAccess: async () => null,
}));
// Spread the real schema barrel rather than enumerating tables: Drizzle table
// definitions are side-effect free, and an omitted export would surface as
// "Export named 'x' not found" for any importer, since mock.module replaces the
// module wholesale.
mock.module("@api/db/schema", () => ({
	...schema,
}));
mock.module("@api/lib/auth", () => ({
	auth: {
		api: {
			getSession: async () => null,
		},
	},
}));
mock.module("drizzle-orm", () => ({
	eq: () => ({}),
	count: () => ({}),
	and: () => ({}),
	or: () => ({}),
	isNull: () => ({}),
	isNotNull: () => ({}),
	gt: () => ({}),
	gte: () => ({}),
	lt: () => ({}),
	lte: () => ({}),
	ne: () => ({}),
	inArray: () => ({}),
	notInArray: () => ({}),
	asc: () => ({}),
	desc: () => ({}),
	sql: () => ({}),
}));
mock.module("hono/bun", () => ({
	createBunWebSocket: () => ({
		websocket: {},
		upgradeWebSocket: () => ({}),
	}),
}));
mock.module("@api/lib/auth-validation", () => ({
	AuthValidationError: class extends Error {
		statusCode = 401;
	},
	performAuthentication: async () => {
		throw new Error("not implemented");
	},
}));
mock.module("@api/utils/websocket-connection", () => ({
	createConnectionEvent: () => ({
		type: "USER_CONNECTED",
		payload: { userId: "user", connectionId: "conn", timestamp: Date.now() },
		timestamp: Date.now(),
		organizationId: "org",
		websiteId: "site",
		visitorId: null,
	}),
	getConnectionIdFromSocket: () => {},
	handleAuthenticationFailure: async () => {},
	handleIdentificationFailure: async () => {},
	sendConnectionEstablishedMessage: () => {},
	sendError: () => {},
	storeConnectionId: () => {},
	updatePresenceIfNeeded: async () => {},
}));
mock.module("@api/utils/websocket-updates", () => ({
	updateLastSeenTimestamps: async () => {},
}));
mock.module("./realtime-pubsub", () => ({
	initializeRealtimePubSub: () => {},
	publishToConnection: () => Promise.resolve(),
	publishToVisitor: () => Promise.resolve(),
	publishToWebsite: () => Promise.resolve(),
}));
mock.module("./router", () => ({
	routeEvent: async (event: AnyRealtimeEvent, context: EventContext) => {
		routeEventCalls.push([event, context]);
	},
}));
mock.module("@cossistant/types/realtime-events", () => ({
	isValidEventType: () => true,
	validateRealtimeEvent: (_type: string, data: unknown) => data,
}));

process.env.RESEND_API_KEY = "test_resend_api_key";

const socketModulePromise = import("./socket");

beforeEach(async () => {
	routeEventCalls.length = 0;
	const { localConnections } = await socketModulePromise;
	localConnections.clear();
});

describe("handleConnectionClose", () => {
	it("emits a user disconnect event and removes the connection", async () => {
		const { handleConnectionClose, localConnections } =
			await socketModulePromise;

		localConnections.set("conn-user", {
			socket: { send: () => {} } as unknown as RawSocket,
			userId: "user-1",
			websiteId: "website-1",
			organizationId: "org-1",
		});

		await handleConnectionClose("conn-user");

		expect(routeEventCalls).toHaveLength(1);
		const [event, context] = routeEventCalls[0];
		expect(event.type).toBe("userDisconnected");
		expect(event.payload).toMatchObject({
			userId: "user-1",
			connectionId: "conn-user",
			organizationId: "org-1",
			websiteId: "website-1",
			visitorId: null,
		});
		expect(context).toMatchObject({
			connectionId: "conn-user",
			userId: "user-1",
			websiteId: "website-1",
			organizationId: "org-1",
		});
		expect(typeof context.sendToWebsite).toBe("function");
		expect(localConnections.has("conn-user")).toBe(false);
	});

	it("emits a visitor disconnect event when visitor metadata is present", async () => {
		const { handleConnectionClose, localConnections } =
			await socketModulePromise;

		localConnections.set("conn-visitor", {
			socket: { send: () => {} } as unknown as RawSocket,
			visitorId: "visitor-1",
			websiteId: "website-9",
			organizationId: "org-9",
		});

		await handleConnectionClose("conn-visitor");

		expect(routeEventCalls).toHaveLength(1);
		const [event, context] = routeEventCalls[0];
		expect(event.type).toBe("visitorDisconnected");
		expect(event.payload).toMatchObject({
			visitorId: "visitor-1",
			connectionId: "conn-visitor",
			organizationId: "org-9",
			websiteId: "website-9",
			userId: null,
		});
		expect(context).toMatchObject({
			connectionId: "conn-visitor",
			visitorId: "visitor-1",
			websiteId: "website-9",
			organizationId: "org-9",
		});
		expect(typeof context.sendToVisitor).toBe("function");
		expect(localConnections.has("conn-visitor")).toBe(false);
	});

	it("returns early when no local connection is found", async () => {
		const { handleConnectionClose, localConnections } =
			await socketModulePromise;

		expect(localConnections.size).toBe(0);
		await handleConnectionClose("missing-conn");

		expect(routeEventCalls).toHaveLength(0);
	});
});

describe("enrichClientEventPayload", () => {
	it("forces user actor identity for conversationSeen from authenticated user context", async () => {
		const { enrichClientEventPayload } = await socketModulePromise;

		const enriched = enrichClientEventPayload(
			"conversationSeen",
			{
				conversationId: "conv-1",
				actorType: "ai_agent",
				actorId: "ai-spoof",
				userId: "user-spoof",
				visitorId: "visitor-spoof",
				aiAgentId: "ai-spoof",
				lastSeenAt: "2000-01-01T00:00:00.000Z",
			},
			{
				organizationId: "org-1",
				websiteId: "site-1",
				userId: "user-auth",
				visitorId: "visitor-route",
			}
		) as Record<string, unknown>;

		expect(enriched.organizationId).toBe("org-1");
		expect(enriched.websiteId).toBe("site-1");
		expect(enriched.userId).toBe("user-auth");
		expect(enriched.visitorId).toBe("visitor-route");
		expect(enriched.aiAgentId).toBeNull();
		expect(enriched.actorType).toBe("user");
		expect(enriched.actorId).toBe("user-auth");
		expect(typeof enriched.lastSeenAt).toBe("string");
	});

	it("forces visitor actor identity for conversationSeen from authenticated visitor context", async () => {
		const { enrichClientEventPayload } = await socketModulePromise;

		const enriched = enrichClientEventPayload(
			"conversationSeen",
			{
				conversationId: "conv-2",
				actorType: "user",
				actorId: "user-spoof",
				userId: "user-spoof",
				visitorId: "visitor-spoof",
				aiAgentId: "ai-spoof",
				lastSeenAt: "2000-01-01T00:00:00.000Z",
			},
			{
				organizationId: "org-2",
				websiteId: "site-2",
				userId: undefined,
				visitorId: "visitor-auth",
			}
		) as Record<string, unknown>;

		expect(enriched.organizationId).toBe("org-2");
		expect(enriched.websiteId).toBe("site-2");
		expect(enriched.userId).toBeNull();
		expect(enriched.visitorId).toBe("visitor-auth");
		expect(enriched.aiAgentId).toBeNull();
		expect(enriched.actorType).toBe("visitor");
		expect(enriched.actorId).toBe("visitor-auth");
		expect(typeof enriched.lastSeenAt).toBe("string");
	});
});
