import {
	openApiSecuritySchemes,
	PRIVATE_API_KEY_SECURITY_SCHEME,
	PUBLIC_API_KEY_SECURITY_SCHEME,
} from "./auth";
import {
	actorUserIdHeader,
	privateApiKeyAuthorizationHeader,
	publicApiKeyHeader,
	publicApiKeyOriginHeader,
	visitorIdHeader,
} from "./headers";

export const DEFAULT_WEBSOCKET_SERVER_URL = "wss://api.cossistant.com";

const websocketTokenQueryParameter = {
	description:
		"Realtime authentication token obtained from `POST /conversations/{conversationId}/seen` or another session bootstrap endpoint. Required when using browser WebSocket APIs that cannot send custom headers.",
	in: "query" as const,
	name: "token",
	required: false,
	schema: {
		type: "string",
	},
};

const websocketConnectionIdQueryParameter = {
	description:
		"Optional stable client connection identifier. When omitted the realtime service assigns one.",
	in: "query" as const,
	name: "connectionId",
	required: false,
	schema: {
		type: "string",
	},
};

const websocketSessionIdQueryParameter = {
	description:
		"Optional browser session identifier used to correlate reconnects and visitor activity.",
	in: "query" as const,
	name: "sessionId",
	required: false,
	schema: {
		type: "string",
	},
};

const websocketTransportQueryParameter = {
	description:
		"Optional transport hint for clients that share one connection URL across native WebSocket and fallback transports.",
	in: "query" as const,
	name: "transport",
	required: false,
	schema: {
		enum: ["websocket"],
		type: "string",
	},
};

export const realtimeComponentSchemas = {
	RealtimeConnectionAccepted: {
		additionalProperties: false,
		properties: {
			connectionId: {
				description: "Server-assigned connection identifier.",
				type: "string",
			},
			type: {
				enum: ["connection.accepted"],
				type: "string",
			},
		},
		required: ["type", "connectionId"],
		type: "object",
	},
	RealtimeErrorMessage: {
		additionalProperties: false,
		properties: {
			code: {
				description: "Machine-readable error code.",
				type: "string",
			},
			message: {
				description: "Human-readable error detail.",
				type: "string",
			},
			type: {
				enum: ["error"],
				type: "string",
			},
		},
		required: ["type", "code", "message"],
		type: "object",
	},
	RealtimeOutboundEvent: {
		additionalProperties: true,
		description:
			"Realtime event payloads. Event names mirror conversation and visitor updates emitted by the REST API.",
		properties: {
			type: {
				description: "Realtime event type.",
				type: "string",
			},
		},
		required: ["type"],
		type: "object",
	},
	RestErrorResponse: {
		additionalProperties: false,
		properties: {
			error: {
				properties: {
					code: {
						type: "string",
					},
					message: {
						type: "string",
					},
					type: {
						type: "string",
					},
				},
				required: ["type", "code", "message"],
				type: "object",
			},
		},
		required: ["error"],
		type: "object",
	},
};

/**
 * The `/ws` handshake is declared by hand because the upgrade is not served by
 * an `OpenAPIHono` route.
 */
export function buildWebsocketPathItem(
	serverUrl: string = DEFAULT_WEBSOCKET_SERVER_URL
) {
	return {
		get: {
			description:
				"Opens a realtime WebSocket connection for conversation, visitor, and support events. Public browser clients normally authenticate with `X-Public-Key` plus `Origin`, or with a short-lived `token` query parameter when custom headers are unavailable. Private integrations can authenticate with `Authorization: Bearer <private-api-key>`.",
			operationId: "connectRealtime",
			parameters: [
				publicApiKeyHeader,
				privateApiKeyAuthorizationHeader,
				publicApiKeyOriginHeader,
				visitorIdHeader,
				actorUserIdHeader,
				websocketTokenQueryParameter,
				websocketConnectionIdQueryParameter,
				websocketSessionIdQueryParameter,
				websocketTransportQueryParameter,
			],
			responses: {
				"101": {
					description:
						"Switching Protocols. The connection is upgraded to WebSocket.",
				},
				"400": {
					content: {
						"application/json": {
							schema: {
								$ref: "#/components/schemas/RestErrorResponse",
							},
						},
					},
					description: "Invalid realtime connection request.",
				},
				"401": {
					content: {
						"application/json": {
							schema: {
								$ref: "#/components/schemas/RestErrorResponse",
							},
						},
					},
					description: "Missing or invalid realtime credentials.",
				},
				"403": {
					content: {
						"application/json": {
							schema: {
								$ref: "#/components/schemas/RestErrorResponse",
							},
						},
					},
					description: "The supplied credentials cannot access realtime data.",
				},
			},
			security: [
				{
					[PUBLIC_API_KEY_SECURITY_SCHEME]: [],
				},
				{
					[PRIVATE_API_KEY_SECURITY_SCHEME]: [],
				},
			],
			servers: [
				{
					url: serverUrl,
				},
			],
			summary: "Open realtime WebSocket connection",
			tags: ["Realtime"],
			"x-websocket-message-schemas": {
				inbound: {
					oneOf: [
						{
							$ref: "#/components/schemas/RealtimeOutboundEvent",
						},
					],
				},
				outbound: {
					oneOf: [
						{
							$ref: "#/components/schemas/RealtimeConnectionAccepted",
						},
						{
							$ref: "#/components/schemas/RealtimeOutboundEvent",
						},
						{
							$ref: "#/components/schemas/RealtimeErrorMessage",
						},
					],
				},
			},
		},
	};
}

export const websocketSecuritySchemes = openApiSecuritySchemes;
