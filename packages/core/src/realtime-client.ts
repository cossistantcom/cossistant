import type { AnyRealtimeEvent } from "@cossistant/types/realtime-events";
import { resolvePublicKey } from "./resolve-public-key";

const DEFAULT_WS_URL = "wss://api.cossistant.com/ws";
const DEFAULT_HEARTBEAT_INTERVAL_MS = 15_000;
const DEFAULT_HEARTBEAT_TIMEOUT_MS = 45_000;
const MAX_RECONNECT_DELAY_MS = 30_000;
const BASE_RECONNECT_DELAY_MS = 500;

/**
 * Close codes that indicate the server rejected the connection permanently.
 * No reconnect should be attempted.
 */
const PERMANENT_CLOSE_CODES = new Set([1008, 1011]);
const REALTIME_EVENT_TYPES = new Set<AnyRealtimeEvent["type"]>([
	"userConnected",
	"userDisconnected",
	"visitorConnected",
	"visitorDisconnected",
	"visitorPresenceUpdate",
	"userPresenceUpdate",
	"conversationSeen",
	"conversationTyping",
	"timelineItemCreated",
	"conversationCreated",
	"visitorIdentified",
	"supportStateUpdated",
	"conversationEventCreated",
	"conversationUpdated",
	"aiAgentProcessingStarted",
	"aiAgentDecisionMade",
	"aiAgentProcessingProgress",
	"aiAgentProcessingCompleted",
	"timelineItemUpdated",
	"timelineItemPartUpdated",
	"crawlStarted",
	"crawlProgress",
	"crawlCompleted",
	"crawlFailed",
	"linkSourceUpdated",
	"crawlPagesDiscovered",
	"crawlPageCompleted",
	"trainingStarted",
	"trainingProgress",
	"trainingCompleted",
	"trainingFailed",
]);

/** Custom close code for heartbeat timeout. */
const HEARTBEAT_TIMEOUT_CODE = 4000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VisitorAuthConfig = {
	kind: "visitor";
	visitorId: string | null;
	websiteId?: string | null;
	publicKey?: string | null;
};

export type SessionAuthConfig = {
	kind: "session";
	sessionToken: string | null;
	websiteId?: string | null;
	userId?: string | null;
};

export type PrivateKeyAuthConfig = {
	kind: "privateKey";
	privateKey: string | null;
	actorUserId?: string | null;
	websiteId?: string | null;
	userId?: string | null;
};

export type RealtimeAuthConfig =
	| VisitorAuthConfig
	| SessionAuthConfig
	| PrivateKeyAuthConfig;

type ResolvedAuthConfig = {
	type: "visitor" | "session" | "privateKey";
	visitorId: string | null;
	websiteId: string | null;
	userId: string | null;
	sessionToken: string | null;
	publicKey: string | null;
	privateKey: string | null;
	actorUserId: string | null;
};

export type RealtimeConnectionStatus =
	| "disconnected"
	| "connecting"
	| "connected";

export type RealtimeConnectionState = {
	status: RealtimeConnectionStatus;
	error: Error | null;
	connectionId: string | null;
};

type SubscribeHandler = (event: AnyRealtimeEvent) => void;
type StateChangeListener = (state: RealtimeConnectionState) => void;

export type RealtimeClientOptions = {
	wsUrl?: string;
	heartbeatIntervalMs?: number;
	heartbeatTimeoutMs?: number;
	onEvent?: (event: AnyRealtimeEvent) => void;
	onConnect?: () => void;
	onDisconnect?: () => void;
	onError?: (error: Error) => void;
};

// ---------------------------------------------------------------------------
// Message parsing (ported from React provider)
// ---------------------------------------------------------------------------

type MessageDecodeResult =
	| { type: "raw-text"; data: string }
	| { type: "unsupported" };

type ParsedMessage =
	| { type: "pong" }
	| { type: "connection-established"; connectionId: string | null }
	| { type: "error"; message: string }
	| { type: "event"; event: AnyRealtimeEvent }
	| { type: "invalid" };

function isRealtimeEventType(type: unknown): type is AnyRealtimeEvent["type"] {
	return (
		typeof type === "string" &&
		REALTIME_EVENT_TYPES.has(type as AnyRealtimeEvent["type"])
	);
}

function isRealtimePayload(
	payload: unknown
): payload is Record<string, unknown> {
	return (
		Boolean(payload) && typeof payload === "object" && !Array.isArray(payload)
	);
}

function decodeMessageData(data: unknown): MessageDecodeResult {
	if (typeof data === "string") {
		return { type: "raw-text", data };
	}

	if (data instanceof ArrayBuffer) {
		try {
			return { type: "raw-text", data: new TextDecoder().decode(data) };
		} catch {
			return { type: "unsupported" };
		}
	}

	if (ArrayBuffer.isView(data)) {
		try {
			return { type: "raw-text", data: new TextDecoder().decode(data.buffer) };
		} catch {
			return { type: "unsupported" };
		}
	}

	return { type: "unsupported" };
}

function parseJson(raw: string): unknown {
	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

function extractStringField(
	obj: unknown,
	field: string,
	_required = false
): string | null {
	if (!obj || typeof obj !== "object" || !(field in obj)) {
		return null;
	}
	const value = (obj as Record<string, unknown>)[field];
	if (typeof value === "string" && value.length > 0) {
		return value;
	}
	return null;
}

function parseWebSocketMessage(rawText: string): ParsedMessage {
	if (rawText === "pong") {
		return { type: "pong" };
	}

	const parsed = parseJson(rawText);
	if (!parsed || typeof parsed !== "object") {
		return { type: "invalid" };
	}

	const messageType = extractStringField(parsed, "type");

	if (messageType === "CONNECTION_ESTABLISHED") {
		const payload = (parsed as { payload?: unknown }).payload;
		const connectionId = extractStringField(payload, "connectionId");
		return { type: "connection-established", connectionId };
	}

	if ("error" in parsed && "message" in parsed) {
		const message =
			extractStringField(parsed, "message") || "Realtime connection error";
		return { type: "error", message };
	}

	if (messageType && isRealtimeEventType(messageType)) {
		try {
			const event = constructRealtimeEvent(parsed);
			if (!event) {
				return { type: "invalid" };
			}
			return { type: "event", event };
		} catch (error) {
			console.error("[Realtime] Failed to construct event", error);
			return { type: "invalid" };
		}
	}

	return { type: "invalid" };
}

function constructRealtimeEvent(parsed: unknown): AnyRealtimeEvent | null {
	if (!parsed || typeof parsed !== "object" || !("type" in parsed)) {
		return null;
	}

	const type = (parsed as { type: unknown }).type;
	if (!isRealtimeEventType(type)) {
		return null;
	}

	const eventType = type;
	const payloadSource = (parsed as { payload?: unknown }).payload;

	if (!isRealtimePayload(payloadSource)) {
		console.error("[Realtime] Received invalid event payload", parsed);
		return null;
	}

	const organizationId = extractStringField(
		payloadSource,
		"organizationId",
		true
	);
	const websiteId = extractStringField(payloadSource, "websiteId", true);

	if (!organizationId) {
		console.error("[Realtime] Received event without organizationId", parsed);
		return null;
	}

	if (!websiteId) {
		console.error("[Realtime] Received event without websiteId", parsed);
		return null;
	}

	const visitorId = extractStringField(parsed, "visitorId");

	return {
		type: eventType,
		// Realtime payloads are server-authored, so we keep client-side validation
		// lightweight for the browser bundle and trust the backend contract here.
		payload: payloadSource,
		organizationId,
		websiteId,
		visitorId,
	} as unknown as AnyRealtimeEvent;
}

// ---------------------------------------------------------------------------
// Auth helpers (ported from React provider)
// ---------------------------------------------------------------------------

function resolvePublicKeyOrNull(explicit?: string | null): string | null {
	return resolvePublicKey(explicit) ?? null;
}

function normalizeAuth(
	auth: RealtimeAuthConfig | null
): ResolvedAuthConfig | null {
	if (!auth) {
		return null;
	}

	if (auth.kind === "visitor") {
		const visitorId = auth.visitorId?.trim() || null;

		if (!visitorId) {
			return null;
		}

		return {
			type: "visitor",
			visitorId,
			websiteId: auth.websiteId?.trim() || null,
			userId: null,
			sessionToken: null,
			publicKey: resolvePublicKeyOrNull(auth.publicKey ?? null),
			privateKey: null,
			actorUserId: null,
		} satisfies ResolvedAuthConfig;
	}

	if (auth.kind === "privateKey") {
		const privateKey = auth.privateKey?.trim() || null;

		if (!privateKey) {
			return null;
		}

		return {
			type: "privateKey",
			visitorId: null,
			websiteId: auth.websiteId?.trim() || null,
			userId: auth.userId?.trim() || auth.actorUserId?.trim() || null,
			sessionToken: null,
			publicKey: null,
			privateKey,
			actorUserId: auth.actorUserId?.trim() || null,
		} satisfies ResolvedAuthConfig;
	}

	const sessionToken = auth.sessionToken?.trim() || null;

	if (!sessionToken) {
		return null;
	}

	return {
		type: "session",
		visitorId: null,
		websiteId: auth.websiteId?.trim() || null,
		userId: auth.userId?.trim() || null,
		sessionToken,
		publicKey: null,
		privateKey: null,
		actorUserId: null,
	} satisfies ResolvedAuthConfig;
}

function buildSocketUrl(
	baseUrl: string,
	auth: ResolvedAuthConfig | null
): string | null {
	if (!auth) {
		return null;
	}

	try {
		const url = new URL(baseUrl);

		if (auth.type === "visitor") {
			url.searchParams.set("visitorId", auth.visitorId ?? "");
			const publicKey = auth.publicKey;
			if (publicKey) {
				url.searchParams.set("publicKey", publicKey);
			}
		} else if (auth.type === "privateKey") {
			url.searchParams.set("token", auth.privateKey ?? "");
			if (auth.actorUserId) {
				url.searchParams.set("actorUserId", auth.actorUserId);
			}
		} else {
			url.searchParams.set("sessionToken", auth.sessionToken ?? "");
			if (auth.websiteId) {
				url.searchParams.set("websiteId", auth.websiteId);
			}
		}

		return url.toString();
	} catch (error) {
		console.error("[Realtime] Failed to build WebSocket URL", error);
		return null;
	}
}

function authChanged(
	a: ResolvedAuthConfig | null,
	b: ResolvedAuthConfig | null
): boolean {
	if (a === b) {
		return false;
	}
	if (!(a && b)) {
		return true;
	}
	return (
		a.visitorId !== b.visitorId ||
		a.websiteId !== b.websiteId ||
		a.userId !== b.userId ||
		a.sessionToken !== b.sessionToken ||
		a.publicKey !== b.publicKey ||
		a.privateKey !== b.privateKey ||
		a.actorUserId !== b.actorUserId
	);
}

// ---------------------------------------------------------------------------
// RealtimeClient
// ---------------------------------------------------------------------------

const INITIAL_STATE: RealtimeConnectionState = {
	status: "disconnected",
	error: null,
	connectionId: null,
};

export class RealtimeClient {
	private wsUrl: string;
	private heartbeatIntervalMs: number;
	private heartbeatTimeoutMs: number;
	private onEventCallback: ((event: AnyRealtimeEvent) => void) | null;
	private onConnectCallback: (() => void) | null;
	private onDisconnectCallback: (() => void) | null;
	private onErrorCallback: ((error: Error) => void) | null;

	private socket: WebSocket | null = null;
	private state: RealtimeConnectionState = { ...INITIAL_STATE };
	private auth: ResolvedAuthConfig | null = null;
	private reconnectAttempt = 0;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
	private lastHeartbeat = 0;
	private destroyed = false;

	// Presence
	private presenceEnabled = false;
	private presencePaused = false;
	private presenceTimer: ReturnType<typeof setInterval> | null = null;
	private presenceIntervalMs = 0;

	// Subscribers
	private eventHandlers = new Set<SubscribeHandler>();
	private stateListeners = new Set<StateChangeListener>();

	constructor(options: RealtimeClientOptions = {}) {
		this.wsUrl = options.wsUrl ?? DEFAULT_WS_URL;
		this.heartbeatIntervalMs =
			options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
		this.heartbeatTimeoutMs =
			options.heartbeatTimeoutMs ?? DEFAULT_HEARTBEAT_TIMEOUT_MS;
		this.onEventCallback = options.onEvent ?? null;
		this.onConnectCallback = options.onConnect ?? null;
		this.onDisconnectCallback = options.onDisconnect ?? null;
		this.onErrorCallback = options.onError ?? null;
	}

	// -----------------------------------------------------------------------
	// Public API
	// -----------------------------------------------------------------------

	connect(auth: RealtimeAuthConfig | null): void {
		if (this.destroyed) {
			return;
		}

		const resolved = normalizeAuth(auth);

		if (!authChanged(this.auth, resolved)) {
			return;
		}

		this.auth = resolved;
		this.reconnectAttempt = 0;
		this.closeSocket();
		this.openSocket();
	}

	disconnect(): void {
		this.clearReconnectTimer();
		this.closeSocket();
		this.auth = null;
		this.setState({ status: "disconnected", error: null, connectionId: null });
	}

	reconnect(): void {
		if (this.destroyed || !this.auth) {
			return;
		}
		this.closeSocket();
		this.reconnectAttempt = 0;
		this.openSocket();
	}

	updateAuth(auth: RealtimeAuthConfig | null): void {
		this.connect(auth);
	}

	send(event: AnyRealtimeEvent): void {
		if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
			throw new Error("Realtime connection is not established");
		}

		this.socket.send(JSON.stringify(event));
	}

	sendRaw(data: string): void {
		if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
			throw new Error("Realtime connection is not established");
		}

		this.socket.send(data);
	}

	subscribe(handler: SubscribeHandler): () => void {
		this.eventHandlers.add(handler);
		return () => {
			this.eventHandlers.delete(handler);
		};
	}

	getState(): RealtimeConnectionState {
		return this.state;
	}

	onStateChange(listener: StateChangeListener): () => void {
		this.stateListeners.add(listener);
		return () => {
			this.stateListeners.delete(listener);
		};
	}

	// Presence management

	enablePresence(intervalMs: number): void {
		this.presenceEnabled = true;
		this.presencePaused = false;
		this.presenceIntervalMs = intervalMs;
		this.startPresenceTimer();
	}

	pausePresence(): void {
		this.presencePaused = true;
		this.stopPresenceTimer();
	}

	resumePresence(): void {
		if (!this.presenceEnabled) {
			return;
		}
		this.presencePaused = false;
		this.sendPresencePing();
		this.startPresenceTimer();
	}

	destroy(): void {
		this.destroyed = true;
		this.disconnect();
		this.stopPresenceTimer();
		this.eventHandlers.clear();
		this.stateListeners.clear();
	}

	// -----------------------------------------------------------------------
	// Internal
	// -----------------------------------------------------------------------

	private openSocket(): void {
		if (this.destroyed) {
			return;
		}

		const url = buildSocketUrl(this.wsUrl, this.auth);
		if (!url) {
			return;
		}

		this.setState({
			...this.state,
			status: "connecting",
			error: null,
		});

		try {
			const socket = new WebSocket(url);
			this.socket = socket;

			socket.onopen = () => {
				if (this.socket !== socket) {
					return;
				}
				this.reconnectAttempt = 0;
				this.lastHeartbeat = Date.now();
				this.startHeartbeat();
				this.setState({
					status: "connected",
					error: null,
					connectionId: this.state.connectionId,
				});
				this.onConnectCallback?.();

				if (this.presenceEnabled && !this.presencePaused) {
					this.sendPresencePing();
					this.startPresenceTimer();
				}
			};

			socket.onclose = (event) => {
				if (this.socket !== socket) {
					return;
				}
				this.stopHeartbeat();
				this.stopPresenceTimer();

				const wasPermanent = PERMANENT_CLOSE_CODES.has(event.code);

				this.setState({
					status: "disconnected",
					error: wasPermanent
						? new Error(
								event.reason ||
									"Realtime connection closed by server. Please check your credentials."
							)
						: this.state.error,
					connectionId: null,
				});

				this.onDisconnectCallback?.();

				if (wasPermanent) {
					if (this.state.error) {
						this.onErrorCallback?.(this.state.error);
					}
					return;
				}

				this.scheduleReconnect();
			};

			socket.onmessage = (event) => {
				if (this.socket !== socket) {
					return;
				}
				this.handleMessage(event.data);
			};

			socket.onerror = () => {
				if (this.socket !== socket || this.destroyed) {
					return;
				}
				const err = new Error("WebSocket error");
				this.setState({ ...this.state, error: err });
				this.onErrorCallback?.(err);
			};
		} catch (error) {
			const err =
				error instanceof Error
					? error
					: new Error(`Failed to create WebSocket: ${String(error)}`);
			this.setState({
				status: "disconnected",
				error: err,
				connectionId: null,
			});
			this.onErrorCallback?.(err);
			this.scheduleReconnect();
		}
	}

	private closeSocket(): void {
		this.stopHeartbeat();
		if (this.socket) {
			const s = this.socket;
			this.socket = null;
			try {
				s.onopen = null;
				s.onclose = null;
				s.onmessage = null;
				s.onerror = null;
				s.close();
			} catch {
				// Ignore close errors
			}
		}
	}

	private handleMessage(data: unknown): void {
		const decoded = decodeMessageData(data);
		if (decoded.type === "unsupported") {
			return;
		}

		const message = parseWebSocketMessage(decoded.data);

		switch (message.type) {
			case "pong":
				this.lastHeartbeat = Date.now();
				break;

			case "connection-established":
				this.lastHeartbeat = Date.now();
				this.setState({ ...this.state, connectionId: message.connectionId });
				break;

			case "error": {
				const err = new Error(message.message);
				this.setState({ ...this.state, error: err });
				this.onErrorCallback?.(err);
				break;
			}

			case "event":
				this.lastHeartbeat = Date.now();
				this.dispatchEvent(message.event);
				break;

			default:
				break;
		}
	}

	private dispatchEvent(event: AnyRealtimeEvent): void {
		this.onEventCallback?.(event);

		for (const handler of this.eventHandlers) {
			try {
				handler(event);
			} catch (error) {
				const err =
					error instanceof Error
						? error
						: new Error(`Subscriber threw an exception: ${String(error)}`);
				this.onErrorCallback?.(err);
			}
		}
	}

	// Heartbeat

	private startHeartbeat(): void {
		this.stopHeartbeat();
		this.heartbeatTimer = setInterval(() => {
			if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
				return;
			}

			if (
				this.lastHeartbeat !== 0 &&
				Date.now() - this.lastHeartbeat > this.heartbeatTimeoutMs
			) {
				this.socket.close(HEARTBEAT_TIMEOUT_CODE, "Heartbeat timeout");
				return;
			}

			try {
				this.socket.send("ping");
			} catch {
				// Ignore send failures; reconnect logic will handle it
			}
		}, this.heartbeatIntervalMs);
	}

	private stopHeartbeat(): void {
		if (this.heartbeatTimer !== null) {
			clearInterval(this.heartbeatTimer);
			this.heartbeatTimer = null;
		}
	}

	// Reconnect

	private scheduleReconnect(): void {
		if (this.destroyed || !this.auth) {
			return;
		}

		this.clearReconnectTimer();

		const delay = Math.min(
			BASE_RECONNECT_DELAY_MS * 2 ** this.reconnectAttempt,
			MAX_RECONNECT_DELAY_MS
		);
		this.reconnectAttempt += 1;

		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			this.openSocket();
		}, delay);
	}

	private clearReconnectTimer(): void {
		if (this.reconnectTimer !== null) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
	}

	// Presence

	private sendPresencePing(): void {
		if (
			!this.socket ||
			this.socket.readyState !== WebSocket.OPEN ||
			this.presencePaused
		) {
			return;
		}

		try {
			this.socket.send("presence:ping");
		} catch {
			// Ignore send failures
		}
	}

	private startPresenceTimer(): void {
		this.stopPresenceTimer();
		if (!this.presenceEnabled || this.presencePaused) {
			return;
		}
		if (this.presenceIntervalMs <= 0) {
			return;
		}
		this.presenceTimer = setInterval(() => {
			this.sendPresencePing();
		}, this.presenceIntervalMs);
	}

	private stopPresenceTimer(): void {
		if (this.presenceTimer !== null) {
			clearInterval(this.presenceTimer);
			this.presenceTimer = null;
		}
	}

	// State management

	private setState(next: RealtimeConnectionState): void {
		const prev = this.state;
		if (
			prev.status === next.status &&
			prev.error === next.error &&
			prev.connectionId === next.connectionId
		) {
			return;
		}

		this.state = next;

		for (const listener of this.stateListeners) {
			listener(next);
		}
	}
}
