import { routers } from "@api/rest/routers";

import {
	actorUserIdHeader,
	openApiSecuritySchemes,
	PRIVATE_API_KEY_SECURITY_SCHEME,
	PUBLIC_API_KEY_SECURITY_SCHEME,
	privateApiKeyAuthorizationHeader,
	publicApiKeyHeader,
	publicApiKeyOriginHeader,
	visitorIdHeader,
} from "./openapi";

type OpenApiOperation = {
	operationId?: string;
	tags?: string[];
	parameters?: Array<{ name?: string } & Record<string, unknown>>;
	[key: string]: unknown;
};

type OpenApiPathItem = Record<string, OpenApiOperation | unknown>;

const HTTP_METHODS = new Set([
	"delete",
	"get",
	"head",
	"options",
	"patch",
	"post",
	"put",
	"trace",
]);

const AUTH_HEADER_PARAMETER_NAMES = new Set(["Authorization", "X-Public-Key"]);

const HTTP_METHOD_OPERATION_PREFIXES: Record<string, string> = {
	delete: "delete",
	get: "get",
	patch: "update",
	post: "create",
	put: "replace",
};

const TAG_BY_PATH_PREFIX: Record<string, string> = {
	"ai-agents": "AI Agents",
	contacts: "Contacts",
	conversations: "Conversations",
	feedback: "Feedback",
	knowledge: "Knowledge",
	messages: "Messages",
	organizations: "Organizations",
	support: "Support",
	uploads: "Uploads",
	visitors: "Visitors",
	websites: "Websites",
	ws: "Realtime",
};

const OPERATION_ID_OVERRIDES: Record<string, string> = {
	"GET /ai-agents": "listAiAgents",
	"GET /ai-agents/{agentId}": "getAiAgent",
	"GET /contacts": "listContacts",
	"POST /contacts": "createContact",
	"GET /contacts/{id}": "getContact",
	"PATCH /contacts/{id}": "updateContact",
	"DELETE /contacts/{id}": "deleteContact",
	"PATCH /contacts/{id}/metadata": "updateContactMetadata",
	"POST /contacts/identify": "identifyContact",
	"POST /contacts/organizations": "createContactOrganization",
	"GET /contacts/organizations/{id}": "getContactOrganization",
	"PATCH /contacts/organizations/{id}": "updateContactOrganization",
	"DELETE /contacts/organizations/{id}": "deleteContactOrganization",
	"POST /conversations": "createConversation",
	"GET /conversations": "listConversations",
	"GET /conversations/inbox": "listInboxConversations",
	"GET /conversations/{conversationId}": "getConversation",
	"GET /conversations/{conversationId}/context": "getConversationContext",
	"GET /conversations/{conversationId}/export": "exportConversation",
	"POST /conversations/{conversationId}/rating": "createConversationRating",
	"GET /conversations/{conversationId}/seen": "getConversationSeen",
	"POST /conversations/{conversationId}/seen": "markConversationSeen",
	"GET /conversations/{conversationId}/timeline": "getConversationTimeline",
	"POST /conversations/{conversationId}/typing": "setConversationTyping",
	"GET /feedback": "listFeedback",
	"POST /feedback": "createFeedback",
	"GET /feedback/summary": "getFeedbackSummary",
	"GET /feedback/{id}": "getFeedback",
	"GET /knowledge": "listKnowledge",
	"POST /knowledge": "createKnowledge",
	"GET /knowledge/search": "searchKnowledge",
	"GET /knowledge/{id}": "getKnowledge",
	"PATCH /knowledge/{id}": "updateKnowledge",
	"DELETE /knowledge/{id}": "deleteKnowledge",
	"POST /messages": "createMessage",
	"GET /organizations/{id}": "getOrganization",
	"PATCH /support/feature-flags": "updateSupportFeatureFlags",
	"PATCH /support/onboarding": "updateSupportOnboarding",
	"GET /support/state": "getSupportState",
	"GET /team-members": "listTeamMembers",
	"POST /uploads/sign-url": "createUploadSignUrl",
	"POST /visitors/{id}/block": "blockVisitor",
	"POST /visitors/{id}/unblock": "unblockVisitor",
	"GET /visitors/{id}": "getVisitor",
	"PATCH /visitors/{id}": "updateVisitor",
	"GET /visitors/{id}/activity": "getVisitorActivity",
	"GET /visitors/{id}/metadata": "getVisitorMetadata",
	"PATCH /visitors/{id}/metadata": "updateVisitorMetadata",
	"GET /websites": "listWebsites",
};

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

export const openApiDocument = {
	components: {
		schemas: {
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
		},
		securitySchemes: openApiSecuritySchemes,
	},
	info: {
		description:
			"Public REST and realtime API for Cossistant. Use public keys for browser/widget visitor flows and private keys for trusted server, CLI, MCP, and support-agent integrations.",
		title: "Cossistant API",
		version: "1.0.0",
	},
	openapi: "3.1.0",
	paths: {
		"/ws": {
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
						description:
							"The supplied credentials cannot access realtime data.",
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
						url: "wss://api.cossistant.com",
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
		},
	},
	servers: [
		{
			url: "https://api.cossistant.com/v1",
		},
	],
};

export function buildOpenApiDocument() {
	const restDocument = routers.getOpenAPI31Document({
		info: openApiDocument.info,
		openapi: openApiDocument.openapi,
		servers: openApiDocument.servers,
	});

	const document = {
		...restDocument,
		components: {
			...restDocument.components,
			schemas: {
				...openApiDocument.components.schemas,
				...(restDocument.components?.schemas ?? {}),
			},
			securitySchemes: openApiDocument.components.securitySchemes,
		},
		paths: {
			...(restDocument.paths ?? {}),
			...openApiDocument.paths,
		},
	};

	for (const [path, pathItem] of Object.entries(
		document.paths as Record<string, OpenApiPathItem>
	)) {
		normalizePathItem(path, pathItem);
	}

	return document;
}

function normalizePathItem(path: string, pathItem: OpenApiPathItem) {
	for (const [method, operation] of Object.entries(pathItem)) {
		if (!(HTTP_METHODS.has(method) && isOpenApiOperation(operation))) {
			continue;
		}

		const key = `${method.toUpperCase()} ${path}`;
		operation.operationId ??=
			OPERATION_ID_OVERRIDES[key] ?? toOperationId(method, path);
		operation.tags = operation.tags?.length
			? operation.tags
			: [tagForPath(path)];
		operation.parameters = operation.parameters?.filter(
			(parameter) =>
				!(parameter.name && AUTH_HEADER_PARAMETER_NAMES.has(parameter.name))
		);
	}
}

function isOpenApiOperation(value: unknown): value is OpenApiOperation {
	return Boolean(value && typeof value === "object" && !("$ref" in value));
}

function tagForPath(path: string) {
	const [firstSegment] = path.split("/").filter(Boolean);
	return TAG_BY_PATH_PREFIX[firstSegment] ?? "API";
}

function toOperationId(method: string, path: string) {
	const prefix = HTTP_METHOD_OPERATION_PREFIXES[method] ?? method;
	const segments = path
		.split("/")
		.filter(Boolean)
		.map((segment) => segment.replace(/[{}]/g, ""))
		.map(toPascalCase);

	return `${prefix}${segments.join("")}`;
}

function toPascalCase(value: string) {
	return value
		.split(/[-_]/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join("");
}
