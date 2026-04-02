import type { CossistantClient } from "@plasma/core";
import type { AnyRealtimeEvent } from "@plasma/types/realtime-events";
import { useCallback, useEffect, useRef } from "react";

const PREVIEW_MAX_LENGTH = 2000;
const SEND_INTERVAL_MS = 800;
const KEEP_ALIVE_MS = 4000;
const STOP_TYPING_DELAY_MS = 2000; // Send isTyping: false after 2 seconds of inactivity

type RealtimeSendFn = (event: AnyRealtimeEvent) => void;

type UseVisitorTypingReporterOptions = {
	client: CossistantClient | null;
	conversationId: string | null;
	/**
	 * Optional WebSocket send function. When provided and the connection is available,
	 * typing events will be sent via WebSocket instead of HTTP for better performance.
	 */
	realtimeSend?: RealtimeSendFn | null;
	/**
	 * Whether the WebSocket connection is currently established.
	 * Required when using realtimeSend to determine when to use HTTP fallback.
	 */
	isRealtimeConnected?: boolean;
};

type UseVisitorTypingReporterResult = {
	handleInputChange: (value: string) => void;
	handleSubmit: () => void;
	stop: () => void;
};

/**
 * Tracks visitor composer activity and reports typing previews to the backend.
 *
 * Handles throttling, keep-alive pings, inactivity fallbacks and ensures a
 * `stop` event is emitted when the component unmounts.
 *
 * When `realtimeSend` is provided and connected, typing events are sent via WebSocket
 * for reduced latency. Falls back to HTTP when WebSocket is unavailable.
 */
export function useVisitorTypingReporter({
	client,
	conversationId,
	realtimeSend,
	isRealtimeConnected = false,
}: UseVisitorTypingReporterOptions): UseVisitorTypingReporterResult {
	const typingActiveRef = useRef(false);
	const lastSentAtRef = useRef(0);
	const latestPreviewRef = useRef<string>("");
	const keepAliveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
		null
	);
	const stopTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
		null
	);

	const clearKeepAlive = useCallback(() => {
		if (keepAliveTimeoutRef.current) {
			clearTimeout(keepAliveTimeoutRef.current);
			keepAliveTimeoutRef.current = null;
		}
	}, []);

	const clearStopTypingTimeout = useCallback(() => {
		if (stopTypingTimeoutRef.current) {
			clearTimeout(stopTypingTimeoutRef.current);
			stopTypingTimeoutRef.current = null;
		}
	}, []);

	const sendTyping = useCallback(
		async (isTyping: boolean, preview?: string | null) => {
			if (!conversationId) {
				return;
			}

			// Try WebSocket first if available and connected
			if (realtimeSend && isRealtimeConnected) {
				try {
					const event: AnyRealtimeEvent = {
						type: "conversationTyping",
						payload: {
							conversationId,
							isTyping,
							visitorPreview:
								isTyping && preview
									? preview.slice(0, PREVIEW_MAX_LENGTH)
									: null,
							// These will be enriched by the server with the actual values
							websiteId: "",
							organizationId: "",
							visitorId: null,
							userId: null,
							aiAgentId: null,
						},
					};
					realtimeSend(event);
					return;
				} catch (error) {
					// WebSocket send failed, fall through to HTTP
					console.warn(
						"[Support] WebSocket typing send failed, falling back to HTTP",
						error
					);
				}
			}

			// Fall back to HTTP via client
			if (!client) {
				return;
			}

			try {
				await client.setVisitorTyping({
					conversationId,
					isTyping,
					visitorPreview: preview ?? undefined,
				});
			} catch (error) {
				console.error("[Support] Failed to send typing event", error);
			}
		},
		[client, conversationId, realtimeSend, isRealtimeConnected]
	);

	const scheduleKeepAlive = useCallback(() => {
		clearKeepAlive();
		keepAliveTimeoutRef.current = setTimeout(() => {
			if (typingActiveRef.current) {
				void sendTyping(true, latestPreviewRef.current);
				scheduleKeepAlive();
			}
		}, KEEP_ALIVE_MS);
	}, [clearKeepAlive, sendTyping]);

	const scheduleStopTyping = useCallback(() => {
		clearStopTypingTimeout();
		stopTypingTimeoutRef.current = setTimeout(() => {
			if (typingActiveRef.current) {
				typingActiveRef.current = false;
				clearKeepAlive();
				void sendTyping(false);
			}
		}, STOP_TYPING_DELAY_MS);
	}, [clearStopTypingTimeout, clearKeepAlive, sendTyping]);

	const handleInputChange = useCallback(
		(value: string) => {
			if (!conversationId) {
				return;
			}

			// Need either WebSocket or HTTP client to be available
			const hasWebSocket = realtimeSend && isRealtimeConnected;
			const hasHttpClient = Boolean(client);
			if (!(hasWebSocket || hasHttpClient)) {
				return;
			}

			const trimmed = value.trim();
			latestPreviewRef.current = trimmed.slice(0, PREVIEW_MAX_LENGTH);
			const now = typeof window !== "undefined" ? Date.now() : 0;

			if (trimmed.length === 0) {
				if (typingActiveRef.current) {
					typingActiveRef.current = false;
					lastSentAtRef.current = now;
					clearKeepAlive();
					clearStopTypingTimeout();
					void sendTyping(false);
				}
				return;
			}

			// Schedule auto-stop after inactivity
			scheduleStopTyping();

			if (!typingActiveRef.current) {
				typingActiveRef.current = true;
				lastSentAtRef.current = now;
				void sendTyping(true, latestPreviewRef.current);
				scheduleKeepAlive();
				return;
			}

			if (now - lastSentAtRef.current >= SEND_INTERVAL_MS) {
				lastSentAtRef.current = now;
				void sendTyping(true, latestPreviewRef.current);
				scheduleKeepAlive();
			}
		},
		[
			client,
			conversationId,
			realtimeSend,
			isRealtimeConnected,
			sendTyping,
			scheduleKeepAlive,
			scheduleStopTyping,
			clearKeepAlive,
			clearStopTypingTimeout,
		]
	);

	const handleSubmit = useCallback(() => {
		if (!typingActiveRef.current) {
			return;
		}

		typingActiveRef.current = false;
		lastSentAtRef.current = typeof window !== "undefined" ? Date.now() : 0;
		clearKeepAlive();
		clearStopTypingTimeout();
		void sendTyping(false);
	}, [clearKeepAlive, clearStopTypingTimeout, sendTyping]);

	const stop = useCallback(() => {
		if (!typingActiveRef.current) {
			return;
		}

		typingActiveRef.current = false;
		lastSentAtRef.current = typeof window !== "undefined" ? Date.now() : 0;
		clearKeepAlive();
		clearStopTypingTimeout();
		void sendTyping(false);
	}, [clearKeepAlive, clearStopTypingTimeout, sendTyping]);

	useEffect(
		() => () => {
			if (typingActiveRef.current) {
				void sendTyping(false);
			}
			clearKeepAlive();
			clearStopTypingTimeout();
		},
		[clearKeepAlive, clearStopTypingTimeout, sendTyping]
	);

	return {
		handleInputChange,
		handleSubmit,
		stop,
	};
}
