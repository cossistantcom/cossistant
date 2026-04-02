/**
 * WebSocket message handling utilities
 */

import type { EventContext } from "@api/ws/router";
import type { AnyRealtimeEvent } from "@plasma/types/realtime-events";
import {
	isValidEventType,
	validateRealtimeEvent,
} from "@plasma/types/realtime-events";
import { WEBSOCKET_ERRORS } from "./websocket-errors";

export type ParsedMessage = {
	type: string;
	data?: unknown;
};

export type ValidatedMessage = {
	event: AnyRealtimeEvent;
	context: EventContext;
};

/**
 * Parse and validate incoming WebSocket message
 */
export function parseMessage(data: string | Buffer): ParsedMessage {
	try {
		const message = JSON.parse(data.toString());

		if (typeof message !== "object" || message === null) {
			throw new Error("Message must be an object");
		}

		if (!message.type) {
			throw new Error("Message must have a type property");
		}

		return message as ParsedMessage;
	} catch (error) {
		throw WEBSOCKET_ERRORS.invalidMessageFormat(error);
	}
}

/**
 * Validate message type and data
 */
export function validateMessage(
	message: ParsedMessage,
	connectionId: string,
	authContext?: {
		userId?: string;
		visitorId?: string;
		websiteId?: string;
		organizationId?: string;
	}
): ValidatedMessage {
	// Validate event type
	if (!isValidEventType(message.type)) {
		throw WEBSOCKET_ERRORS.invalidEventType(message.type);
	}

	// Validate event data
	const validatedData = validateRealtimeEvent(message.type, message.data);

	// Create event
	const event = {
		type: message.type,
		payload: validatedData,
	} as AnyRealtimeEvent;

	// Create context
	const context: EventContext = {
		connectionId,
		userId: authContext?.userId,
		visitorId: authContext?.visitorId,
		websiteId: authContext?.websiteId,
		organizationId: authContext?.organizationId,
		ws: undefined,
	};

	return { event, context };
}

/**
 * Handle message processing errors
 */
export function handleMessageError(error: unknown): {
	error: string;
	message: string;
} {
	if (
		error &&
		typeof error === "object" &&
		"error" in error &&
		"message" in error
	) {
		return error as { error: string; message: string };
	}

	console.error("[WebSocket] Error processing message:", error);
	return WEBSOCKET_ERRORS.serverError(error);
}
