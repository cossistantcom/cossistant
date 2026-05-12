import { db } from "@api/db";
import type { ApiKeyWithWebsiteAndOrganization } from "@api/db/queries/api-keys";
import { getConversationById } from "@api/db/queries/conversation";
import { canVisitorAccessConversation } from "@api/db/queries/conversation-access";
import { normalizeSessionToken, resolveSession } from "@api/db/queries/session";
import { getWebsiteByIdWithAccess } from "@api/db/queries/website";
import { website as websiteTable } from "@api/db/schema";
import {
	AuthValidationError,
	type AuthValidationOptions,
	performAuthentication,
} from "@api/lib/auth-validation";
import { resolvePrivateApiKeyActorUser } from "@api/lib/private-api-key-actor";
import { markUserPresence, markVisitorPresence } from "@api/services/presence";
import {
	createConnectionEvent,
	getConnectionIdFromSocket,
	handleAuthenticationFailure,
	handleIdentificationFailure,
	sendConnectionEstablishedMessage,
	sendError,
	storeConnectionId,
	updatePresenceIfNeeded,
	type WSContext,
} from "@api/utils/websocket-connection";
import { updateLastSeenTimestamps } from "@api/utils/websocket-updates";
import { APIKeyType } from "@cossistant/types";
import {
	type AnyRealtimeEvent,
	isValidEventType,
	type RealtimeEvent,
	type RealtimeEventData,
	type RealtimeEventType,
	validateRealtimeEvent,
} from "@cossistant/types/realtime-events";
import type { ServerWebSocket } from "bun";
import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { createBunWebSocket } from "hono/bun";
import type { LocalConnectionRecord, RawSocket } from "./connection-registry";
import {
	dispatchEventToLocalConnection,
	dispatchEventToLocalVisitor,
	dispatchEventToLocalWebsite,
	localConnections,
	registerConnection,
	unregisterConnection,
} from "./connection-registry";
import {
	initializeRealtimePubSub,
	publishToConnection,
	publishToVisitor,
	publishToWebsite,
} from "./realtime-pubsub";
import {
	type ConnectionDispatcher,
	type EventContext,
	routeEvent,
	type VisitorDispatcher,
	type WebsiteDispatcher,
} from "./router";

export type { LocalConnectionRecord, RawSocket } from "./connection-registry";
export { localConnections } from "./connection-registry";

export type ConnectionData = {
	connectionId: string;
	userId?: string;
	connectedAt: number;
	apiKey?: ApiKeyWithWebsiteAndOrganization;
	organizationId?: string;
	websiteId?: string;
};

initializeRealtimePubSub({
	connection: dispatchEventToLocalConnection,
	visitor: dispatchEventToLocalVisitor,
	website: dispatchEventToLocalWebsite,
});

export const sendEventToConnection: ConnectionDispatcher = (
	connectionId,
	event
) => {
	publishToConnection(connectionId, event).catch((error) => {
		console.error("[RealtimePubSub] Failed to publish connection event", {
			connectionId,
			error,
		});
	});
};

export const sendEventToVisitor: VisitorDispatcher = (
	visitorId,
	event,
	options
) => {
	publishToVisitor(visitorId, event, options).catch((error) => {
		console.error("[RealtimePubSub] Failed to publish visitor event", {
			visitorId,
			error,
		});
	});
};

export const sendEventToWebsite: WebsiteDispatcher = (
	websiteId,
	event,
	options
) => {
	publishToWebsite(websiteId, event, options).catch((error) => {
		console.error("[RealtimePubSub] Failed to publish website event", {
			websiteId,
			error,
		});
	});
};

// Use WSContext type from websocket-connection.ts for consistency
type SocketContext = WSContext;

type ConnectionContextDetails = Pick<
	EventContext,
	"organizationId" | "userId" | "visitorId" | "websiteId"
>;

function resolveActiveConnection(
	ws: SocketContext
): { connectionId: string; record: LocalConnectionRecord } | null {
	const connectionId = getConnectionIdFromSocket(ws);
	const record = connectionId ? localConnections.get(connectionId) : undefined;

	if (!(connectionId && record)) {
		console.error("[WebSocket] No connection found");
		sendError(ws, {
			error: "Connection not authenticated",
			message: "Please reconnect with valid authentication.",
		});
		return null;
	}

	return { connectionId, record };
}

function resolveConnectionContextDetails(
	connectionId: string,
	record: LocalConnectionRecord,
	ws: SocketContext
): ConnectionContextDetails | null {
	const { userId, visitorId, websiteId, organizationId } = record;

	if (!((userId || visitorId) && websiteId && organizationId)) {
		console.error(
			`[WebSocket] Missing connection metadata for ${connectionId}`
		);
		sendError(ws, {
			error: "Connection context unavailable",
			message: "Unable to determine connection context. Please reconnect.",
		});
		return null;
	}

	return { userId, visitorId, websiteId, organizationId };
}

async function refreshConnectionPresence(
	metadata: ConnectionContextDetails
): Promise<void> {
	if (!metadata.websiteId) {
		return;
	}

	const now = new Date().toISOString();
	const tasks: Promise<unknown>[] = [];

	if (metadata.userId) {
		tasks.push(
			markUserPresence({
				websiteId: metadata.websiteId,
				userId: metadata.userId,
				lastSeenAt: now,
			})
		);
	}

	if (metadata.visitorId) {
		tasks.push(
			markVisitorPresence({
				websiteId: metadata.websiteId,
				visitorId: metadata.visitorId,
				lastSeenAt: now,
			})
		);
	}

	if (tasks.length === 0) {
		return;
	}

	try {
		await Promise.all(tasks);
	} catch (error) {
		console.error("[WebSocket] Failed to refresh presence", {
			websiteId: metadata.websiteId,
			userId: metadata.userId,
			visitorId: metadata.visitorId,
			error,
		});
	}
}

function sendInvalidFormatResponse(ws: SocketContext, error: unknown): void {
	ws.send(
		JSON.stringify({
			error: "Invalid message format",
			details: error instanceof Error ? error.message : "Unknown error",
		})
	);
}

/**
 * List of event types that clients are allowed to send via WebSocket.
 * Server-only events (like userConnected, visitorConnected, etc.) are not in this list.
 */
const CLIENT_ALLOWED_EVENT_TYPES = new Set([
	"conversationTyping",
	"conversationSeen",
]);

/**
 * Validates that a client is authorized to send a typing event for a conversation.
 * - Visitors can only send typing events for conversations they own
 * - Users can send typing events for any conversation on websites they have access to
 */
async function validateTypingEventAuthorization(
	payload: { conversationId: string; visitorId?: string | null },
	connectionContext: ConnectionContextDetails,
	ws: SocketContext
): Promise<boolean> {
	const { conversationId } = payload;
	const {
		visitorId: connectionVisitorId,
		userId,
		websiteId,
	} = connectionContext;

	// Get the conversation to validate ownership
	const conversation = await getConversationById(db, { conversationId });

	if (!conversation) {
		sendError(ws, {
			error: "Conversation not found",
			message: `Conversation ${conversationId} does not exist`,
		});
		return false;
	}

	// Validate website matches
	if (conversation.websiteId !== websiteId) {
		sendError(ws, {
			error: "Unauthorized",
			message: "Conversation does not belong to this website",
		});
		return false;
	}

	if (connectionVisitorId && !userId) {
		const canAccessConversation = await canVisitorAccessConversation(db, {
			organizationId: connectionContext.organizationId ?? "",
			websiteId,
			viewerVisitorId: connectionVisitorId,
			conversationVisitorId: conversation.visitorId,
		});

		if (!canAccessConversation) {
			sendError(ws, {
				error: "Unauthorized",
				message: "You can only send typing events for your own conversations",
			});
			return false;
		}

		if (payload.visitorId && payload.visitorId !== connectionVisitorId) {
			sendError(ws, {
				error: "Invalid visitorId",
				message: "visitorId must match the current visitor",
			});
			return false;
		}
	}

	// For users: they're already authenticated for the website, so they can type in any conversation
	// (Dashboard agents can respond to any conversation on their website)

	return true;
}

/**
 * Validates that a client is authorized to send a seen event for a conversation.
 * Similar rules to typing events.
 */
async function validateSeenEventAuthorization(
	payload: { conversationId: string },
	connectionContext: ConnectionContextDetails,
	ws: SocketContext
): Promise<boolean> {
	const { conversationId } = payload;
	const {
		visitorId: connectionVisitorId,
		userId,
		websiteId,
	} = connectionContext;

	const conversation = await getConversationById(db, { conversationId });

	if (!conversation) {
		sendError(ws, {
			error: "Conversation not found",
			message: `Conversation ${conversationId} does not exist`,
		});
		return false;
	}

	if (conversation.websiteId !== websiteId) {
		sendError(ws, {
			error: "Unauthorized",
			message: "Conversation does not belong to this website",
		});
		return false;
	}

	if (connectionVisitorId && !userId) {
		const canAccessConversation = await canVisitorAccessConversation(db, {
			organizationId: connectionContext.organizationId ?? "",
			websiteId,
			viewerVisitorId: connectionVisitorId,
			conversationVisitorId: conversation.visitorId,
		});

		if (!canAccessConversation) {
			sendError(ws, {
				error: "Unauthorized",
				message: "You can only mark your own conversations as seen",
			});
			return false;
		}
	}

	return true;
}

/**
 * Validates client-initiated events before routing.
 * Returns true if the event is authorized, false otherwise.
 */
async function validateClientEvent(
	eventType: string,
	payload: unknown,
	connectionContext: ConnectionContextDetails,
	ws: SocketContext
): Promise<boolean> {
	// Check if this event type is allowed from clients
	if (!CLIENT_ALLOWED_EVENT_TYPES.has(eventType)) {
		sendError(ws, {
			error: "Unauthorized event type",
			message: `Event type "${eventType}" cannot be sent by clients`,
		});
		return false;
	}

	const typedPayload = payload as {
		conversationId?: string;
		visitorId?: string | null;
	};

	switch (eventType) {
		case "conversationTyping":
			if (!typedPayload.conversationId) {
				sendError(ws, {
					error: "Missing conversationId",
					message: "conversationId is required for this event type",
				});
				return false;
			}
			return await validateTypingEventAuthorization(
				typedPayload as { conversationId: string; visitorId?: string | null },
				connectionContext,
				ws
			);
		case "conversationSeen":
			if (!typedPayload.conversationId) {
				sendError(ws, {
					error: "Missing conversationId",
					message: "conversationId is required for this event type",
				});
				return false;
			}
			return await validateSeenEventAuthorization(
				typedPayload as { conversationId: string },
				connectionContext,
				ws
			);
		default:
			// Unknown event type in CLIENT_ALLOWED_EVENT_TYPES without explicit handler
			console.warn(
				`[WebSocket] Unhandled client event type "${eventType}" for connection`,
				{
					eventType,
					websiteId: connectionContext.websiteId,
					userId: connectionContext.userId,
					visitorId: connectionContext.visitorId,
				}
			);
			sendError(ws, {
				error: "Unhandled event type",
				message: `Event type "${eventType}" is allowed but has no authorization handler`,
			});
			return false;
	}
}

/**
 * Enriches client-initiated event payloads with connection context.
 * This ensures server-side data integrity by using the authenticated
 * connection's context rather than trusting client-provided values.
 */
export function enrichClientEventPayload(
	eventType: string,
	payload: unknown,
	connectionContext: ConnectionContextDetails
): unknown {
	const basePayload = payload as Record<string, unknown>;
	const { organizationId, websiteId, userId, visitorId } = connectionContext;

	switch (eventType) {
		case "conversationTyping":
			return {
				...basePayload,
				organizationId,
				websiteId,
				// Use connection context for actor identification
				userId: userId ?? null,
				visitorId:
					typeof basePayload.visitorId === "string"
						? basePayload.visitorId
						: (visitorId ?? null),
				aiAgentId: null, // Clients can't impersonate AI agents
			};
		case "conversationSeen":
			// Force actor identity from the authenticated connection context.
			// Never trust client-supplied actorType/actorId for seen events.
			if (userId) {
				return {
					...basePayload,
					organizationId,
					websiteId,
					userId,
					visitorId: visitorId ?? null,
					aiAgentId: null,
					actorType: "user",
					actorId: userId,
					lastSeenAt: new Date().toISOString(),
				};
			}

			if (visitorId) {
				return {
					...basePayload,
					organizationId,
					websiteId,
					userId: null,
					visitorId,
					aiAgentId: null,
					actorType: "visitor",
					actorId: visitorId,
					lastSeenAt: new Date().toISOString(),
				};
			}

			return {
				...basePayload,
				organizationId,
				websiteId,
				userId: null,
				visitorId: null,
				aiAgentId: null,
				actorType: "visitor",
				actorId: "",
				lastSeenAt: new Date().toISOString(),
			};
		default:
			return {
				...basePayload,
				organizationId,
				websiteId,
			};
	}
}

type ParsedInboundEvent = {
	type: RealtimeEventType;
	payload: RealtimeEventData<RealtimeEventType>;
};

function extractVisitorIdFromPayload(payload: unknown): string | null {
	if (!payload || typeof payload !== "object") {
		return null;
	}

	if ("visitorId" in payload) {
		const value = (payload as { visitorId?: unknown }).visitorId;
		if (typeof value === "string" && value.length > 0) {
			return value;
		}
	}

	if ("message" in payload) {
		const messageVisitorId = (
			payload as {
				message?: { visitorId?: unknown } | null;
			}
		).message?.visitorId;
		if (typeof messageVisitorId === "string" && messageVisitorId.length > 0) {
			return messageVisitorId;
		}
	}

	if ("conversation" in payload) {
		const conversationVisitorId = (
			payload as {
				conversation?: { visitorId?: unknown } | null;
			}
		).conversation?.visitorId;
		if (
			typeof conversationVisitorId === "string" &&
			conversationVisitorId.length > 0
		) {
			return conversationVisitorId;
		}
	}

	return null;
}

function parseRealtimeEventMessage(
	rawMessage: unknown,
	ws: SocketContext
): ParsedInboundEvent | null {
	let message: { data?: unknown; payload?: unknown; type?: string };

	try {
		message = JSON.parse(String(rawMessage));
	} catch (error) {
		console.error("[WebSocket] Error parsing message:", error);
		sendInvalidFormatResponse(ws, error);
		return null;
	}

	if (!(message.type && isValidEventType(message.type))) {
		console.error(`[WebSocket] Invalid event type: ${message.type}`);
		sendError(ws, {
			error: "Invalid event type",
			message: `Invalid event type: ${message.type}`,
		});
		return null;
	}

	const payloadCandidate =
		message.payload !== undefined ? message.payload : message.data;

	let validatedData: RealtimeEventData<RealtimeEventType>;

	try {
		validatedData = validateRealtimeEvent(message.type, payloadCandidate);
	} catch (error) {
		console.error("[WebSocket] Event validation failed:", error);
		sendInvalidFormatResponse(ws, error);
		return null;
	}

	return {
		type: message.type,
		payload: validatedData,
	};
}

// Enable auth logging by setting ENABLE_AUTH_LOGS=true
const AUTH_LOGS_ENABLED = process.env.ENABLE_AUTH_LOGS === "true";

/**
 * Generates a unique connection ID
 */
export function generateConnectionId(): string {
	return `conn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Handles WebSocket connection lifecycle
 */
export const { websocket, upgradeWebSocket } =
	createBunWebSocket<ServerWebSocket>();

/**
 * Broadcast helpers are implemented via the router dispatch callbacks.
 */
function cleanupConnection(connectionId: string): void {
	unregisterConnection(connectionId);
	console.log(`[WebSocket] Cleaned up connection: ${connectionId}`);
}

export async function handleConnectionClose(
	connectionId: string
): Promise<void> {
	try {
		const localConnection = localConnections.get(connectionId);
		const userId = localConnection?.userId;
		const visitorId = localConnection?.visitorId;
		const websiteId = localConnection?.websiteId;
		const organizationId = localConnection?.organizationId;

		if (!localConnection) {
			console.error(
				`[WebSocket] Missing local connection metadata for ${connectionId} on close`
			);
			return;
		}

		if (!(websiteId && organizationId)) {
			console.error(
				`[WebSocket] Missing routing metadata for ${connectionId} on close`
			);
			return;
		}

		const context: EventContext = {
			connectionId,
			userId,
			visitorId,
			websiteId,
			organizationId,
			sendToConnection: sendEventToConnection,
			sendToVisitor: sendEventToVisitor,
			sendToWebsite: sendEventToWebsite,
			ws: undefined,
		};

		if (userId && organizationId && websiteId) {
			const disconnectEvent: RealtimeEvent<"userDisconnected"> = {
				type: "userDisconnected",
				payload: {
					userId,
					connectionId,
					organizationId,
					websiteId,
					visitorId: null,
				},
			};

			await routeEvent(disconnectEvent, context);
		} else if (visitorId && organizationId && websiteId) {
			const disconnectEvent: RealtimeEvent<"visitorDisconnected"> = {
				type: "visitorDisconnected",
				payload: {
					connectionId,
					organizationId,
					websiteId,
					visitorId,
					userId: null,
				},
			};

			await routeEvent(disconnectEvent, context);
		} else {
			// TODO: replace console.* with logger
			console.error(
				`[WebSocket] Missing connection metadata for ${connectionId} on close`
			);
		}
	} finally {
		cleanupConnection(connectionId);
	}
}

/**
 * Extract authentication credentials from WebSocket context
 */
function extractAuthCredentials(c: Context): {
	privateKey: string | undefined;
	publicKey: string | undefined;
	actualOrigin: string | undefined;
	visitorId: string | undefined;
	actorUserId: string | undefined;
} {
	// Try headers first (for non-browser clients)
	const authHeader = c.req.header("Authorization");
	let privateKey = authHeader?.split(" ")[1];
	let publicKey = c.req.header("X-Public-Key");
	let visitorId = c.req.header("X-Visitor-Id");
	let actorUserId = c.req.header("X-Actor-User-Id");

	// Fallback to URL parameters (for browser WebSocket clients)
	// This is necessary because browsers can't set custom headers on WebSocket connections
	if (!privateKey) {
		privateKey = c.req.query("token");
	}
	if (!publicKey) {
		publicKey = c.req.query("publicKey");
	}
	if (!visitorId) {
		visitorId = c.req.query("visitorId");
	}
	if (!actorUserId) {
		actorUserId = c.req.query("actorUserId");
	}

	// Extract origin from WebSocket-specific headers
	// Priority: Origin > Sec-WebSocket-Origin > Referer
	const origin = c.req.header("Origin");
	const secWebSocketOrigin = c.req.header("Sec-WebSocket-Origin");
	const referer = c.req.header("Referer");

	let actualOrigin = origin || secWebSocketOrigin;

	// If no origin headers, try to extract from referer
	if (!actualOrigin && referer) {
		try {
			const refererUrl = new URL(referer);
			actualOrigin = `${refererUrl.protocol}//${refererUrl.host}`;
		} catch {
			// Invalid referer URL, ignore
		}
	}

	if (AUTH_LOGS_ENABLED) {
		console.log("[WebSocket Auth] Extracted credentials:", {
			hasPrivateKey: !!privateKey,
			hasPublicKey: !!publicKey,
			publicKey: publicKey ? `${publicKey.substring(0, 10)}...` : null,
			origin,
			secWebSocketOrigin,
			referer,
			actualOrigin,
			visitorId: visitorId ? `${visitorId.substring(0, 8)}...` : null,
			actorUserId: actorUserId ? `${actorUserId.substring(0, 8)}...` : null,
		});
	}

	return { privateKey, publicKey, actualOrigin, visitorId, actorUserId };
}

function extractSessionToken(c: Context): string | undefined {
	const queryCandidates = [
		c.req.query("sessionToken"),
		c.req.query("sessionId"),
		c.req.query("session"),
	];

	for (const candidate of queryCandidates) {
		const normalized = normalizeSessionToken(candidate);
		if (normalized) {
			return normalized;
		}
	}

	const headerToken = normalizeSessionToken(
		c.req.header("x-user-session-token")
	);

	return headerToken;
}

/**
 * Parse protocol and hostname from origin
 */
function parseOriginDetails(actualOrigin: string | undefined): {
	protocol: string | undefined;
	hostname: string | undefined;
} {
	if (!actualOrigin) {
		return { protocol: undefined, hostname: undefined };
	}

	try {
		const url = new URL(actualOrigin);
		// Convert HTTP protocols to WebSocket protocols for validation
		const protocol =
			url.protocol === "https:"
				? "wss:"
				: url.protocol === "http:"
					? "ws:"
					: url.protocol;
		return { protocol, hostname: url.hostname };
	} catch (error) {
		if (AUTH_LOGS_ENABLED) {
			console.log("[WebSocket Auth] Failed to parse origin:", error);
		}
		return { protocol: undefined, hostname: undefined };
	}
}

/**
 * Extract protocol and hostname from request if not available from origin
 */
function extractFromRequest(c: Context): {
	protocol: string | undefined;
	hostname: string | undefined;
} {
	const hostHeader = c.req.header("Host");
	if (!hostHeader) {
		return { protocol: undefined, hostname: undefined };
	}

	const hostname = hostHeader.split(":")[0];
	const isSecure = c.req.url.startsWith("wss://");
	const protocol = isSecure ? "wss:" : "ws:";

	return { protocol, hostname };
}

/**
 * Extract protocol and hostname from WebSocket context
 */
function extractProtocolAndHostname(
	c: Context,
	actualOrigin: string | undefined
): { protocol: string | undefined; hostname: string | undefined } {
	if (actualOrigin) {
		return parseOriginDetails(actualOrigin);
	}

	// Fallback to extracting from the WebSocket request URL
	const requestDetails = extractFromRequest(c);

	if (AUTH_LOGS_ENABLED && requestDetails.hostname) {
		console.log("[WebSocket Auth] No origin header, using request details:", {
			protocol: requestDetails.protocol,
			hostname: requestDetails.hostname,
			url: c.req.url,
		});
	}

	return requestDetails;
}

/**
 * Log authentication attempt if logging is enabled
 */
function logAuthAttempt({
	hasPrivateKey,
	hasPublicKey,
	hasSessionToken,
	actualOrigin,
	url,
}: {
	hasPrivateKey: boolean;
	hasPublicKey: boolean;
	hasSessionToken: boolean;
	actualOrigin: string | undefined;
	url: string;
}): void {
	if (AUTH_LOGS_ENABLED) {
		console.log("[WebSocket Auth] Authentication attempt:", {
			hasPrivateKey,
			hasPublicKey,
			hasSessionToken,
			origin: actualOrigin,
			url,
		});
	}
}

/**
 * Log authentication success if logging is enabled
 */
function logAuthSuccess(result: WebSocketAuthSuccess): void {
	if (AUTH_LOGS_ENABLED) {
		console.log("[WebSocket Auth] Authentication successful:", {
			hasApiKey: !!result.apiKey,
			apiKeyId: result.apiKey?.id,
			organizationId: result.organizationId,
			websiteId: result.websiteId,
			userId: result.userId,
			visitorId: result.visitorId
				? `${result.visitorId.substring(0, 8)}...`
				: null,
			isTestKey: result.isTestKey,
		});
	}
}

/**
 * Result of a successful WebSocket authentication
 */
export type WebSocketAuthSuccess = {
	organizationId?: string;
	websiteId?: string;
	userId?: string;
	visitorId?: string;
	apiKey?: ApiKeyWithWebsiteAndOrganization;
	isTestKey?: boolean;
};

/**
 * Perform WebSocket authentication with API key
 */
async function performApiKeyAuthentication(
	privateKey: string | undefined,
	publicKey: string | undefined,
	options: AuthValidationOptions
): Promise<WebSocketAuthSuccess | null> {
	try {
		const result = await authenticateWithApiKey(privateKey, publicKey, options);
		return result;
	} catch (error) {
		if (error instanceof AuthValidationError) {
			if (AUTH_LOGS_ENABLED) {
				console.log("[WebSocket Auth] API key authentication failed:", {
					error: error.message,
					statusCode: error.statusCode,
				});
			}
			throw error;
		}
		throw error;
	}
}

/**
 * Validate and apply website override to authentication result
 */
async function applyWebsiteOverride(
	result: WebSocketAuthSuccess,
	websiteIdParam: string | undefined
): Promise<void> {
	if (!websiteIdParam) {
		return;
	}

	// Only allow website override for session-based auth,
	// or when it matches the API key's bound website.
	if (result.apiKey) {
		const boundId = result.apiKey.website?.id;
		if (boundId && boundId !== websiteIdParam) {
			throw new AuthValidationError(403, "Website mismatch for API key");
		}

		result.websiteId = websiteIdParam;
		if (!result.organizationId) {
			result.organizationId = result.apiKey.organization.id;
		}
		return;
	}

	if (result.userId) {
		const site = await getWebsiteByIdWithAccess(db, {
			userId: result.userId,
			websiteId: websiteIdParam,
		});

		if (!site) {
			throw new AuthValidationError(403, "Website override not permitted");
		}

		result.websiteId = site.id;
		result.organizationId = site.organizationId;
		return;
	}

	result.websiteId = websiteIdParam;
}

/**
 * Perform the actual authentication based on available credentials
 */
async function performWebSocketAuth(
	c: Context,
	credentials: {
		privateKey: string | undefined;
		publicKey: string | undefined;
		sessionToken: string | undefined;
	},
	options: AuthValidationOptions
): Promise<WebSocketAuthSuccess | null> {
	const { privateKey, publicKey, sessionToken } = credentials;

	if (privateKey || publicKey) {
		return await performApiKeyAuthentication(privateKey, publicKey, options);
	}

	const result = await authenticateWithSession(c, sessionToken);

	if (!result && AUTH_LOGS_ENABLED) {
		console.log("[WebSocket Auth] No valid authentication method provided");
	}

	return result;
}

/**
 * Authenticate WebSocket connection
 * Accept either API keys (public/private) or a Better Auth session via cookies
 */
async function authenticateWebSocketConnection(
	c: Context
): Promise<WebSocketAuthSuccess | null> {
	try {
		// Extract credentials
		const { privateKey, publicKey, actualOrigin, visitorId, actorUserId } =
			extractAuthCredentials(c);
		const websiteIdParam = c.req.query("websiteId")?.trim() || undefined;
		const sessionToken = extractSessionToken(c);

		logAuthAttempt({
			hasPrivateKey: !!privateKey,
			hasPublicKey: !!publicKey,
			hasSessionToken: !!sessionToken,
			actualOrigin,
			url: c.req.url,
		});

		// Extract protocol and hostname
		const { protocol, hostname } = extractProtocolAndHostname(c, actualOrigin);

		// Build validation options
		const options: AuthValidationOptions = {
			origin: actualOrigin,
			protocol,
			hostname,
		};

		// Authenticate with API key or session
		const result = await performWebSocketAuth(
			c,
			{ privateKey, publicKey, sessionToken },
			options
		);

		// Add visitorId and website override if authentication was successful
		if (result) {
			result.visitorId = visitorId;
			await applyWebsiteOverride(result, websiteIdParam);

			const apiKey = result.apiKey;

			if (apiKey && apiKey.keyType === APIKeyType.PRIVATE) {
				const actor = await resolvePrivateApiKeyActorUser({
					db,
					apiKey,
					organizationId: apiKey.organization.id,
					websiteTeamId: apiKey.website?.teamId,
					explicitActorUserId: actorUserId,
					required: true,
				});

				result.userId = actor?.userId;
			}

			logAuthSuccess(result);
		}

		return result;
	} catch (error) {
		if (AUTH_LOGS_ENABLED) {
			console.error("[WebSocket Auth] Authentication failed:", error);
		}

		if (error instanceof AuthValidationError) {
			throw error;
		}

		// For any other errors, wrap them
		throw new AuthValidationError(500, "Internal authentication error");
	}
}

async function authenticateWithApiKey(
	privateKey: string | undefined,
	publicKey: string | undefined,
	options: AuthValidationOptions
): Promise<WebSocketAuthSuccess> {
	const result = await performAuthentication(
		privateKey,
		publicKey,
		db,
		options
	);

	const authSuccess: WebSocketAuthSuccess = {
		apiKey: result.apiKey,
		isTestKey: result.isTestKey,
		organizationId: result.apiKey.organization.id,
		websiteId: result.apiKey.website?.id,
	};

	return authSuccess;
}

async function authenticateWithSession(
	c: Context,
	sessionToken: string | undefined
): Promise<WebSocketAuthSuccess | null> {
	const session = await resolveSession(db, {
		headers: c.req.raw.headers,
		sessionToken,
	});
	if (!session) {
		if (AUTH_LOGS_ENABLED) {
			console.log(
				sessionToken
					? "[WebSocket Auth] Session token invalid or expired"
					: "[WebSocket Auth] No API key or session provided"
			);
		}
		return null;
	}

	const organizationIdFromSession =
		session.session.activeOrganizationId ?? null;
	const activeTeamId = session.session.activeTeamId ?? null;
	let websiteId: string | undefined;
	let organizationIdFromWebsite: string | undefined;

	if (activeTeamId) {
		const [site] = await db
			.select({
				id: websiteTable.id,
				organizationId: websiteTable.organizationId,
			})
			.from(websiteTable)
			.where(eq(websiteTable.teamId, activeTeamId))
			.limit(1);
		websiteId = site?.id;
		organizationIdFromWebsite = site?.organizationId;
	}

	const resolvedOrganizationId =
		organizationIdFromSession ?? organizationIdFromWebsite ?? undefined;

	if (!resolvedOrganizationId && AUTH_LOGS_ENABLED) {
		console.log(
			"[WebSocket Auth] Session found but no active organization; proceeding without website context"
		);
	}

	return {
		organizationId: resolvedOrganizationId,
		websiteId,
		userId: session.user.id,
	};
}

export const upgradedWebsocket = upgradeWebSocket(async (c) => {
	let authResult: WebSocketAuthSuccess | null = null;
	let authError: AuthValidationError | null = null;

	try {
		// Perform authentication during the upgrade phase
		authResult = await authenticateWebSocketConnection(c);
	} catch (error) {
		if (error instanceof AuthValidationError) {
			authError = error;
		} else {
			// Log unexpected errors but don't expose them to the client
			console.error("[WebSocket] Unexpected authentication error:", error);
			authError = new AuthValidationError(500, "Authentication failed");
		}
	}

	return {
		async onOpen(evt, ws) {
			const connectionId = generateConnectionId();

			// If we have an authentication error, send it and close the connection
			if (authError) {
				sendError(ws, {
					error: "Authentication failed",
					message: authError.message,
					code: authError.statusCode,
				});
				ws.close(
					authError.statusCode >= 400 && authError.statusCode < 500
						? 1008
						: 1011,
					authError.message
				);
				return;
			}

			// Check if authentication was successful
			if (!authResult) {
				await handleAuthenticationFailure(ws, connectionId);
				return;
			}

			// Check if we have either a user ID or visitor ID
			if (!(authResult.userId || authResult.visitorId)) {
				await handleIdentificationFailure(ws, connectionId);
				return;
			}

			// Track socket locally for this server instance using indexed registry
			registerConnection(connectionId, {
				socket: ws.raw as RawSocket,
				websiteId: authResult.websiteId,
				organizationId: authResult.organizationId,
				userId: authResult.userId,
				visitorId: authResult.visitorId,
			});
			storeConnectionId(ws, connectionId);

			console.log(
				`[WebSocket] Connection opened: ${connectionId} for organization: ${authResult.organizationId}`
			);

			// Send successful connection message
			sendConnectionEstablishedMessage(ws, connectionId, authResult);

			// Emit USER_CONNECTED or VISITOR_CONNECTED event based on authentication type
			try {
				const event = createConnectionEvent(authResult, connectionId);
				const context: EventContext = {
					connectionId,
					userId: authResult.userId,
					visitorId: authResult.visitorId,
					websiteId: authResult.websiteId,
					organizationId: authResult.organizationId,
					sendToConnection: sendEventToConnection,
					sendToVisitor: sendEventToVisitor,
					sendToWebsite: sendEventToWebsite,
					ws: undefined,
				};
				await routeEvent(event, context);
			} catch (error) {
				console.error("[WebSocket] Error creating connection event:", error);
				// Continue with connection setup even if event creation fails
			}

			console.log("[WebSocket] Connection established", {
				connectionId,
				websiteId: authResult.websiteId,
				visitorId: authResult.visitorId,
				userId: authResult.userId,
				organizationId: authResult.organizationId,
			});

			await updatePresenceIfNeeded(authResult);

			// Update last seen timestamps
			await updateLastSeenTimestamps({ db, authResult });
		},

		async onMessage(evt, ws) {
			const activeConnection = resolveActiveConnection(ws);

			if (!activeConnection) {
				return;
			}

			const metadata = resolveConnectionContextDetails(
				activeConnection.connectionId,
				activeConnection.record,
				ws
			);

			if (!metadata) {
				return;
			}

			if (typeof evt.data === "string") {
				if (evt.data === "ping") {
					ws.send("pong");
					return;
				}

				if (evt.data === "presence:ping") {
					ws.send("pong");
					await refreshConnectionPresence(metadata);
					return;
				}
			}

			const parsed = parseRealtimeEventMessage(evt.data, ws);

			if (!parsed) {
				return;
			}

			const context: EventContext = {
				connectionId: activeConnection.connectionId,
				...metadata,
				sendToConnection: sendEventToConnection,
				sendToVisitor: sendEventToVisitor,
				sendToWebsite: sendEventToWebsite,
				ws: undefined,
			};

			try {
				if (metadata.organizationId && metadata.websiteId) {
					// Validate client-initiated events before routing
					const isAuthorized = await validateClientEvent(
						parsed.type,
						parsed.payload,
						metadata,
						ws
					);

					if (!isAuthorized) {
						// Error already sent to client by validateClientEvent
						return;
					}

					// Enrich payload with connection context for typing/seen events
					const enrichedPayload = enrichClientEventPayload(
						parsed.type,
						parsed.payload,
						metadata
					);

					const event = {
						type: parsed.type,
						payload: enrichedPayload,
					} as AnyRealtimeEvent;

					await routeEvent(event, context);
				} else {
					console.error("[WebSocket] Missing organizationId or websiteId");
				}
			} catch (error) {
				console.error("[WebSocket] Error processing message:", error);
				sendInvalidFormatResponse(ws, error);
			}
		},

		async onClose(evt, ws) {
			// Get connectionId from the WebSocket
			const connectionId = ws.raw
				? (ws.raw as ServerWebSocket & { connectionId?: string }).connectionId
				: undefined;

			if (!connectionId) {
				console.error("[WebSocket] No connection ID found on close");
				return;
			}

			await handleConnectionClose(connectionId);
		},

		onError(evt, ws) {
			// Get connectionId from the WebSocket
			const connectionId = ws.raw
				? (ws.raw as ServerWebSocket & { connectionId?: string }).connectionId
				: undefined;

			console.error(`[WebSocket] Error on connection ${connectionId}:`, evt);
		},
	};
});
