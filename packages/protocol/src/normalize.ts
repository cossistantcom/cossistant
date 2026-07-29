/**
 * Operation-ID and tag normalization.
 *
 * Most route descriptors do not declare an `operationId` or `tags`; they are
 * backfilled here. This layer is part of the wire contract — changing it
 * renames operations for every generated client.
 */

export type OpenApiOperation = {
	operationId?: string;
	tags?: string[];
	parameters?: Array<{ name?: string } & Record<string, unknown>>;
	[key: string]: unknown;
};

export type OpenApiPathItem = Record<string, OpenApiOperation | unknown>;

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

/**
 * Auth headers are declared per-route so they render in request examples, but
 * they are stripped from the served document because the security schemes
 * already describe them.
 */
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

/**
 * Some entries no longer match any live path (e.g. `GET /ai-agents/{agentId}`
 * where the real path is `/{id}`). They are dead but kept verbatim: removing
 * them cannot change output, and editing this map is how operation IDs
 * accidentally get renamed.
 */
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

function isOpenApiOperation(value: unknown): value is OpenApiOperation {
	return Boolean(value && typeof value === "object" && !("$ref" in value));
}

function toPascalCase(value: string) {
	return value
		.split(/[-_]/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join("");
}

export function toOperationId(method: string, path: string) {
	const prefix = HTTP_METHOD_OPERATION_PREFIXES[method] ?? method;
	const segments = path
		.split("/")
		.filter(Boolean)
		.map((segment) => segment.replace(/[{}]/g, ""))
		.map(toPascalCase);

	return `${prefix}${segments.join("")}`;
}

export function tagForPath(path: string) {
	const [firstSegment] = path.split("/").filter(Boolean);
	// Behaviourally identical to `TAG_BY_PATH_PREFIX[firstSegment] ?? "API"`;
	// the guard exists only because this package enables noUncheckedIndexedAccess.
	return (firstSegment ? TAG_BY_PATH_PREFIX[firstSegment] : undefined) ?? "API";
}

export function normalizePathItem(path: string, pathItem: OpenApiPathItem) {
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
