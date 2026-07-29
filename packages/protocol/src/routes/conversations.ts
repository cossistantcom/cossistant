import {
	conversationContextRequestSchema,
	conversationContextResponseSchema,
	createConversationConflictResponseSchema,
	createConversationRequestSchema,
	createConversationResponseSchema,
	getConversationRequestSchema,
	getConversationResponseSchema,
	getConversationSeenDataResponseSchema,
	listConversationsRequestSchema,
	listConversationsResponseSchema,
	listInboxConversationsRequestSchema,
	listInboxConversationsResponseSchema,
	markConversationSeenRequestSchema,
	markConversationSeenResponseSchema,
	pauseConversationAiRestRequestSchema,
	privateConversationMutationResponseSchema,
	setConversationTypingRequestSchema,
	setConversationTypingResponseSchema,
	submitConversationRatingRequestSchema,
	submitConversationRatingResponseSchema,
	updateConversationMetadataRequestSchema,
	updateConversationPriorityRestRequestSchema,
	updateConversationSentimentRestRequestSchema,
	updateConversationTitleRestRequestSchema,
} from "@cossistant/types/api/conversation";
import {
	getConversationTimelineItemsRequestSchema,
	getConversationTimelineItemsResponseSchema,
} from "@cossistant/types/api/timeline-item";
import { createRoute, z } from "@hono/zod-openapi";
import { privateControlAuth, runtimeDualAuth } from "../auth";
import { errorJsonResponse } from "../errors";

export const conversationIdPathParameter = {
	name: "conversationId",
	in: "path",
	description: "The ID of the conversation.",
	required: true,
	schema: {
		type: "string",
	},
} as const;

/**
 * Also consumed at runtime by the export handler in apps/api
 * (`safelyExtractRequestQuery(c, emptyQuerySchema)`). Import it from here rather
 * than redefining it, or the documented contract and the runtime parse drift.
 */
export const emptyQuerySchema = z.object({});

export const createConversationRoute = createRoute({
	method: "post",
	path: "/",
	summary: "Create a conversation (optionally with initial timeline items)",
	description:
		"Create a conversation; optionally pass a conversationId, public metadata, and a set of default timeline items. When a default item's createdAt is omitted, the server assigns the timestamp. Historical timestamps are allowed. Timestamps more than 5 minutes in the future are rejected.",
	tags: ["Conversations"],
	request: {
		body: {
			required: true,
			content: {
				"application/json": {
					schema: createConversationRequestSchema,
				},
			},
		},
	},
	responses: {
		200: {
			description: "Conversation created",
			content: {
				"application/json": {
					schema: createConversationResponseSchema,
				},
			},
		},
		409: {
			description:
				"Conversation ID conflict (already exists for a different visitor or tenant)",
			content: {
				"application/json": {
					schema: createConversationConflictResponseSchema,
				},
			},
		},
		400: errorJsonResponse(
			"Invalid request or defaultTimelineItems createdAt more than 5 minutes in the future"
		),
		401: errorJsonResponse("Unauthorized - Invalid or missing API key"),
		403: errorJsonResponse("Forbidden - Public key origin validation failed"),
	},
	...runtimeDualAuth({ includeVisitorIdHeader: true }),
});

export const listConversationsRoute = createRoute({
	method: "get",
	path: "/",
	summary: "List conversations for a visitor",
	description:
		"Fetch paginated list of conversations for a specific visitor with optional filters. Public conversation metadata is included when present.",
	tags: ["Conversations"],
	request: {
		query: listConversationsRequestSchema,
	},
	responses: {
		200: {
			description: "List of conversations retrieved successfully",
			content: {
				"application/json": {
					schema: listConversationsResponseSchema,
				},
			},
		},
		400: errorJsonResponse("Invalid request"),
		401: errorJsonResponse("Unauthorized - Invalid or missing API key"),
		403: errorJsonResponse("Forbidden - Public key origin validation failed"),
	},
	...runtimeDualAuth({ includeVisitorIdHeader: true }),
});

export const resolveConversationRoute = createRoute({
	method: "post",
	path: "/{conversationId}/resolve",
	summary: "Resolve a conversation",
	description:
		"Marks a conversation as resolved. Requires a private API key. When using an unlinked private key, send `X-Actor-User-Id` with a valid website teammate ID.",
	operationId: "resolveConversation",
	tags: ["Conversations"],
	responses: {
		200: {
			description: "Conversation resolved successfully",
			content: {
				"application/json": {
					schema: privateConversationMutationResponseSchema,
				},
			},
		},
		400: errorJsonResponse(
			"Bad request - Missing actor for an unlinked private API key"
		),
		401: errorJsonResponse("Unauthorized - Invalid or missing private API key"),
		403: errorJsonResponse(
			"Forbidden - Private API key required or actor user not allowed for this website"
		),
		404: errorJsonResponse("Conversation not found"),
		500: errorJsonResponse("Internal server error"),
	},
	...privateControlAuth({
		parameters: [conversationIdPathParameter],
		includeActorUserIdHeader: true,
	}),
});

export const reopenConversationRoute = createRoute({
	method: "post",
	path: "/{conversationId}/reopen",
	summary: "Reopen a conversation",
	description:
		"Reopens a previously resolved or spam conversation. Requires a private API key and an acting teammate.",
	operationId: "reopenConversation",
	tags: ["Conversations"],
	responses: {
		200: {
			description: "Conversation reopened successfully",
			content: {
				"application/json": {
					schema: privateConversationMutationResponseSchema,
				},
			},
		},
		400: errorJsonResponse(
			"Bad request - Missing actor for an unlinked private API key"
		),
		401: errorJsonResponse("Unauthorized - Invalid or missing private API key"),
		403: errorJsonResponse(
			"Forbidden - Private API key required or actor user not allowed for this website"
		),
		404: errorJsonResponse("Conversation not found"),
		500: errorJsonResponse("Internal server error"),
	},
	...privateControlAuth({
		parameters: [conversationIdPathParameter],
		includeActorUserIdHeader: true,
	}),
});

export const markConversationAsSpamRoute = createRoute({
	method: "post",
	path: "/{conversationId}/spam",
	summary: "Mark a conversation as spam",
	description:
		"Marks a conversation as spam. Requires a private API key and an acting teammate.",
	operationId: "markConversationAsSpam",
	tags: ["Conversations"],
	responses: {
		200: {
			description: "Conversation marked as spam successfully",
			content: {
				"application/json": {
					schema: privateConversationMutationResponseSchema,
				},
			},
		},
		400: errorJsonResponse(
			"Bad request - Missing actor for an unlinked private API key"
		),
		401: errorJsonResponse("Unauthorized - Invalid or missing private API key"),
		403: errorJsonResponse(
			"Forbidden - Private API key required or actor user not allowed for this website"
		),
		404: errorJsonResponse("Conversation not found"),
		500: errorJsonResponse("Internal server error"),
	},
	...privateControlAuth({
		parameters: [conversationIdPathParameter],
		includeActorUserIdHeader: true,
	}),
});

export const markConversationAsNotSpamRoute = createRoute({
	method: "post",
	path: "/{conversationId}/not-spam",
	summary: "Mark a conversation as not spam",
	description:
		"Restores a spam conversation back to the open state. Requires a private API key and an acting teammate.",
	operationId: "markConversationAsNotSpam",
	tags: ["Conversations"],
	responses: {
		200: {
			description: "Conversation marked as not spam successfully",
			content: {
				"application/json": {
					schema: privateConversationMutationResponseSchema,
				},
			},
		},
		400: errorJsonResponse(
			"Bad request - Missing actor for an unlinked private API key"
		),
		401: errorJsonResponse("Unauthorized - Invalid or missing private API key"),
		403: errorJsonResponse(
			"Forbidden - Private API key required or actor user not allowed for this website"
		),
		404: errorJsonResponse("Conversation not found"),
		500: errorJsonResponse("Internal server error"),
	},
	...privateControlAuth({
		parameters: [conversationIdPathParameter],
		includeActorUserIdHeader: true,
	}),
});

export const archiveConversationRoute = createRoute({
	method: "post",
	path: "/{conversationId}/archive",
	summary: "Archive a conversation",
	description:
		"Archives a conversation from the inbox. This matches the dashboard delete behavior and requires a private API key plus an acting teammate.",
	operationId: "archiveConversation",
	tags: ["Conversations"],
	responses: {
		200: {
			description: "Conversation archived successfully",
			content: {
				"application/json": {
					schema: privateConversationMutationResponseSchema,
				},
			},
		},
		400: errorJsonResponse(
			"Bad request - Missing actor for an unlinked private API key"
		),
		401: errorJsonResponse("Unauthorized - Invalid or missing private API key"),
		403: errorJsonResponse(
			"Forbidden - Private API key required or actor user not allowed for this website"
		),
		404: errorJsonResponse("Conversation not found"),
		500: errorJsonResponse("Internal server error"),
	},
	...privateControlAuth({
		parameters: [conversationIdPathParameter],
		includeActorUserIdHeader: true,
	}),
});

export const unarchiveConversationRoute = createRoute({
	method: "post",
	path: "/{conversationId}/unarchive",
	summary: "Unarchive a conversation",
	description:
		"Restores an archived conversation. Requires a private API key and an acting teammate.",
	operationId: "unarchiveConversation",
	tags: ["Conversations"],
	responses: {
		200: {
			description: "Conversation unarchived successfully",
			content: {
				"application/json": {
					schema: privateConversationMutationResponseSchema,
				},
			},
		},
		400: errorJsonResponse(
			"Bad request - Missing actor for an unlinked private API key"
		),
		401: errorJsonResponse("Unauthorized - Invalid or missing private API key"),
		403: errorJsonResponse(
			"Forbidden - Private API key required or actor user not allowed for this website"
		),
		404: errorJsonResponse("Conversation not found"),
		500: errorJsonResponse("Internal server error"),
	},
	...privateControlAuth({
		parameters: [conversationIdPathParameter],
		includeActorUserIdHeader: true,
	}),
});

export const markConversationAsReadRoute = createRoute({
	method: "post",
	path: "/{conversationId}/read",
	summary: "Mark a conversation as read",
	description:
		"Marks a conversation as read for the acting teammate. Requires a private API key and an acting teammate.",
	operationId: "markConversationAsRead",
	tags: ["Conversations"],
	responses: {
		200: {
			description: "Conversation marked as read successfully",
			content: {
				"application/json": {
					schema: privateConversationMutationResponseSchema,
				},
			},
		},
		400: errorJsonResponse(
			"Bad request - Missing actor for an unlinked private API key"
		),
		401: errorJsonResponse("Unauthorized - Invalid or missing private API key"),
		403: errorJsonResponse(
			"Forbidden - Private API key required or actor user not allowed for this website"
		),
		404: errorJsonResponse("Conversation not found"),
	},
	...privateControlAuth({
		parameters: [conversationIdPathParameter],
		includeActorUserIdHeader: true,
	}),
});

export const markConversationAsUnreadRoute = createRoute({
	method: "post",
	path: "/{conversationId}/unread",
	summary: "Mark a conversation as unread",
	description:
		"Clears the acting teammate's read marker for a conversation. Requires a private API key and an acting teammate.",
	operationId: "markConversationAsUnread",
	tags: ["Conversations"],
	responses: {
		200: {
			description: "Conversation marked as unread successfully",
			content: {
				"application/json": {
					schema: privateConversationMutationResponseSchema,
				},
			},
		},
		400: errorJsonResponse(
			"Bad request - Missing actor for an unlinked private API key"
		),
		401: errorJsonResponse("Unauthorized - Invalid or missing private API key"),
		403: errorJsonResponse(
			"Forbidden - Private API key required or actor user not allowed for this website"
		),
		404: errorJsonResponse("Conversation not found"),
	},
	...privateControlAuth({
		parameters: [conversationIdPathParameter],
		includeActorUserIdHeader: true,
	}),
});

export const updateConversationMetadataRoute = createRoute({
	method: "patch",
	path: "/{conversationId}/metadata",
	summary: "Update conversation metadata",
	description:
		"Merges metadata into a conversation. Conversation metadata are public and retrievable on public conversation endpoints, but this post-creation update route requires a private API key.",
	operationId: "updateConversationMetadata",
	tags: ["Conversations"],
	request: {
		body: {
			required: true,
			content: {
				"application/json": {
					schema: updateConversationMetadataRequestSchema,
				},
			},
		},
	},
	responses: {
		200: {
			description: "Conversation metadata updated successfully",
			content: {
				"application/json": {
					schema: privateConversationMutationResponseSchema,
				},
			},
		},
		400: errorJsonResponse("Bad request - Invalid request payload"),
		401: errorJsonResponse("Unauthorized - Invalid or missing private API key"),
		403: errorJsonResponse("Forbidden - Private API key required"),
		404: errorJsonResponse("Conversation not found"),
		500: errorJsonResponse("Internal server error"),
	},
	...privateControlAuth({
		parameters: [conversationIdPathParameter],
	}),
});

export const updateConversationPriorityRoute = createRoute({
	method: "patch",
	path: "/{conversationId}/priority",
	summary: "Update a conversation priority",
	description:
		"Updates the conversation priority and marks it as human-owned. Requires a private API key and an acting teammate.",
	operationId: "updateConversationPriority",
	tags: ["Conversations"],
	request: {
		body: {
			required: true,
			content: {
				"application/json": {
					schema: updateConversationPriorityRestRequestSchema,
				},
			},
		},
	},
	responses: {
		200: {
			description: "Conversation priority updated successfully",
			content: {
				"application/json": {
					schema: privateConversationMutationResponseSchema,
				},
			},
		},
		400: errorJsonResponse(
			"Bad request - Invalid request payload or missing actor for an unlinked private API key"
		),
		401: errorJsonResponse("Unauthorized - Invalid or missing private API key"),
		403: errorJsonResponse(
			"Forbidden - Private API key required or actor user not allowed for this website"
		),
		404: errorJsonResponse("Conversation not found"),
		500: errorJsonResponse("Internal server error"),
	},
	...privateControlAuth({
		parameters: [conversationIdPathParameter],
		includeActorUserIdHeader: true,
	}),
});

export const updateConversationSentimentRoute = createRoute({
	method: "patch",
	path: "/{conversationId}/sentiment",
	summary: "Update a conversation sentiment",
	description:
		"Updates the conversation sentiment and marks it as human-owned. Pass null to mark sentiment as unknown. Requires a private API key and an acting teammate.",
	operationId: "updateConversationSentiment",
	tags: ["Conversations"],
	request: {
		body: {
			required: true,
			content: {
				"application/json": {
					schema: updateConversationSentimentRestRequestSchema,
				},
			},
		},
	},
	responses: {
		200: {
			description: "Conversation sentiment updated successfully",
			content: {
				"application/json": {
					schema: privateConversationMutationResponseSchema,
				},
			},
		},
		400: errorJsonResponse(
			"Bad request - Invalid request payload or missing actor for an unlinked private API key"
		),
		401: errorJsonResponse("Unauthorized - Invalid or missing private API key"),
		403: errorJsonResponse(
			"Forbidden - Private API key required or actor user not allowed for this website"
		),
		404: errorJsonResponse("Conversation not found"),
		500: errorJsonResponse("Internal server error"),
	},
	...privateControlAuth({
		parameters: [conversationIdPathParameter],
		includeActorUserIdHeader: true,
	}),
});

export const updateConversationTitleRoute = createRoute({
	method: "patch",
	path: "/{conversationId}",
	summary: "Update a conversation title",
	description:
		"Updates the conversation title. This private control route does not require an acting teammate in v1.",
	operationId: "updateConversationTitle",
	tags: ["Conversations"],
	request: {
		body: {
			required: true,
			content: {
				"application/json": {
					schema: updateConversationTitleRestRequestSchema,
				},
			},
		},
	},
	responses: {
		200: {
			description: "Conversation title updated successfully",
			content: {
				"application/json": {
					schema: privateConversationMutationResponseSchema,
				},
			},
		},
		400: errorJsonResponse("Bad request - Invalid request payload"),
		401: errorJsonResponse("Unauthorized - Invalid or missing private API key"),
		403: errorJsonResponse("Forbidden - Private API key required"),
		404: errorJsonResponse("Conversation not found"),
		500: errorJsonResponse("Internal server error"),
	},
	...privateControlAuth({
		parameters: [conversationIdPathParameter],
	}),
});

export const pauseConversationAiRoute = createRoute({
	method: "post",
	path: "/{conversationId}/ai/pause",
	summary: "Pause AI replies for a conversation",
	description:
		"Pauses AI replies for a conversation for the provided duration. Requires a private API key and an acting teammate.",
	operationId: "pauseConversationAi",
	tags: ["Conversations"],
	request: {
		body: {
			required: false,
			content: {
				"application/json": {
					schema: pauseConversationAiRestRequestSchema,
				},
			},
		},
	},
	responses: {
		200: {
			description: "Conversation AI paused successfully",
			content: {
				"application/json": {
					schema: privateConversationMutationResponseSchema,
				},
			},
		},
		400: errorJsonResponse(
			"Bad request - Invalid request payload or missing actor for an unlinked private API key"
		),
		401: errorJsonResponse("Unauthorized - Invalid or missing private API key"),
		403: errorJsonResponse(
			"Forbidden - Private API key required or actor user not allowed for this website"
		),
		404: errorJsonResponse("Conversation not found"),
		500: errorJsonResponse("Internal server error"),
	},
	...privateControlAuth({
		parameters: [conversationIdPathParameter],
		includeActorUserIdHeader: true,
	}),
});

export const resumeConversationAiRoute = createRoute({
	method: "post",
	path: "/{conversationId}/ai/resume",
	summary: "Resume AI replies for a conversation",
	description:
		"Resumes AI replies for a conversation. Requires a private API key and an acting teammate.",
	operationId: "resumeConversationAi",
	tags: ["Conversations"],
	responses: {
		200: {
			description: "Conversation AI resumed successfully",
			content: {
				"application/json": {
					schema: privateConversationMutationResponseSchema,
				},
			},
		},
		400: errorJsonResponse(
			"Bad request - Missing actor for an unlinked private API key"
		),
		401: errorJsonResponse("Unauthorized - Invalid or missing private API key"),
		403: errorJsonResponse(
			"Forbidden - Private API key required or actor user not allowed for this website"
		),
		404: errorJsonResponse("Conversation not found"),
		500: errorJsonResponse("Internal server error"),
	},
	...privateControlAuth({
		parameters: [conversationIdPathParameter],
		includeActorUserIdHeader: true,
	}),
});

export const joinConversationEscalationRoute = createRoute({
	method: "post",
	path: "/{conversationId}/join-escalation",
	summary: "Join an escalated conversation",
	description:
		"Marks an escalation as handled and adds the acting teammate as a participant if needed. Requires a private API key and an acting teammate.",
	operationId: "joinConversationEscalation",
	tags: ["Conversations"],
	responses: {
		200: {
			description: "Escalation joined successfully",
			content: {
				"application/json": {
					schema: privateConversationMutationResponseSchema,
				},
			},
		},
		400: errorJsonResponse(
			"Bad request - Missing actor for an unlinked private API key"
		),
		401: errorJsonResponse("Unauthorized - Invalid or missing private API key"),
		403: errorJsonResponse(
			"Forbidden - Private API key required or actor user not allowed for this website"
		),
		404: errorJsonResponse("Conversation not found"),
		500: errorJsonResponse("Internal server error"),
	},
	...privateControlAuth({
		parameters: [conversationIdPathParameter],
		includeActorUserIdHeader: true,
	}),
});

export const listInboxConversationsRoute = createRoute({
	method: "get",
	path: "/inbox",
	summary: "List inbox conversations",
	description:
		"Returns a cursor-paginated inbox view for the authenticated website. This control-plane endpoint requires a private API key.",
	tags: ["Conversations"],
	request: {
		query: listInboxConversationsRequestSchema,
	},
	responses: {
		200: {
			description: "Inbox conversations retrieved successfully",
			content: {
				"application/json": {
					schema: listInboxConversationsResponseSchema,
				},
			},
		},
		401: errorJsonResponse("Unauthorized - Invalid or missing private API key"),
		403: errorJsonResponse("Forbidden - Private API key required"),
		500: errorJsonResponse("Internal server error"),
	},
	...privateControlAuth({
		includeActorUserIdHeader: true,
	}),
});

export const getConversationContextRoute = createRoute({
	method: "get",
	path: "/{conversationId}/context",
	summary: "Get conversation context",
	description:
		"Returns agent-ready private context for a conversation, including rich conversation state, visitor/contact profile, a private timeline page, and linked feedback.",
	tags: ["Conversations"],
	request: {
		params: getConversationRequestSchema,
		query: conversationContextRequestSchema,
	},
	responses: {
		200: {
			description: "Conversation context retrieved successfully",
			content: {
				"application/json": {
					schema: conversationContextResponseSchema,
				},
			},
		},
		400: errorJsonResponse("Invalid request"),
		401: errorJsonResponse("Unauthorized - Invalid or missing private API key"),
		403: errorJsonResponse("Forbidden - Private API key required"),
		404: errorJsonResponse("Conversation not found"),
		500: errorJsonResponse("Internal server error"),
	},
	...privateControlAuth({
		parameters: [conversationIdPathParameter],
		includeActorUserIdHeader: true,
	}),
});

export const getConversationRoute = createRoute({
	method: "get",
	path: "/{conversationId}",
	summary: "Get a single conversation by ID",
	description:
		"Fetch a specific conversation by its ID, including any public conversation metadata.",
	tags: ["Conversations"],
	request: {
		params: getConversationRequestSchema,
	},
	responses: {
		200: {
			description: "Conversation retrieved successfully",
			content: {
				"application/json": {
					schema: getConversationResponseSchema,
				},
			},
		},
		400: errorJsonResponse("Invalid request"),
		401: errorJsonResponse("Unauthorized - Invalid or missing API key"),
		403: errorJsonResponse("Forbidden - Public key origin validation failed"),
		404: errorJsonResponse("Conversation not found"),
		500: errorJsonResponse("Internal server error"),
	},
	...runtimeDualAuth({
		parameters: [conversationIdPathParameter],
		includeVisitorIdHeader: true,
	}),
});

export const markConversationSeenRoute = createRoute({
	method: "post",
	path: "/{conversationId}/seen",
	summary: "Mark a conversation as seen by the visitor",
	description:
		"Record a visitor's last seen timestamp for a specific conversation.",
	tags: ["Conversations"],
	request: {
		body: {
			required: false,
			content: {
				"application/json": {
					schema: markConversationSeenRequestSchema,
				},
			},
		},
	},
	responses: {
		200: {
			description: "Conversation seen timestamp recorded",
			content: {
				"application/json": {
					schema: markConversationSeenResponseSchema,
				},
			},
		},
		400: errorJsonResponse("Invalid request"),
		401: errorJsonResponse("Unauthorized - Invalid or missing API key"),
		403: errorJsonResponse("Forbidden - Public key origin validation failed"),
		404: errorJsonResponse("Conversation not found"),
	},
	...runtimeDualAuth({
		parameters: [conversationIdPathParameter],
		includeVisitorIdHeader: true,
	}),
});

export const setConversationTypingRoute = createRoute({
	method: "post",
	path: "/{conversationId}/typing",
	summary: "Report a visitor typing state",
	description:
		"Emit a typing indicator event for the visitor. Either visitorId must be provided via body or headers.",
	tags: ["Conversations"],
	request: {
		body: {
			required: true,
			content: {
				"application/json": {
					schema: setConversationTypingRequestSchema,
				},
			},
		},
	},
	responses: {
		200: {
			description: "Typing state recorded",
			content: {
				"application/json": {
					schema: setConversationTypingResponseSchema,
				},
			},
		},
		400: errorJsonResponse("Invalid request"),
		401: errorJsonResponse("Unauthorized - Invalid or missing API key"),
		403: errorJsonResponse("Forbidden - Public key origin validation failed"),
		404: errorJsonResponse("Conversation not found"),
	},
	...runtimeDualAuth({
		parameters: [conversationIdPathParameter],
		includeVisitorIdHeader: true,
	}),
});

export const createConversationRatingRoute = createRoute({
	method: "post",
	path: "/{conversationId}/rating",
	summary: "Submit a visitor rating for a conversation",
	description:
		"Record a visitor rating (1-5) for a resolved conversation. Requires visitor ownership.",
	tags: ["Conversations"],
	request: {
		body: {
			required: true,
			content: {
				"application/json": {
					schema: submitConversationRatingRequestSchema,
				},
			},
		},
	},
	responses: {
		200: {
			description: "Conversation rating recorded",
			content: {
				"application/json": {
					schema: submitConversationRatingResponseSchema,
				},
			},
		},
		400: errorJsonResponse("Invalid request"),
		401: errorJsonResponse("Unauthorized - Invalid or missing API key"),
		403: errorJsonResponse("Forbidden"),
		404: errorJsonResponse("Conversation not found"),
	},
	...runtimeDualAuth({
		parameters: [conversationIdPathParameter],
		includeVisitorIdHeader: true,
	}),
});

export const getConversationSeenRoute = createRoute({
	method: "get",
	path: "/{conversationId}/seen",
	summary: "Get conversation seen data",
	description:
		"Fetch the seen data (read receipts) for a conversation, showing who has seen messages and when.",
	tags: ["Conversations"],
	responses: {
		200: {
			description: "Seen data retrieved successfully",
			content: {
				"application/json": {
					schema: getConversationSeenDataResponseSchema,
				},
			},
		},
		400: errorJsonResponse("Invalid request"),
		401: errorJsonResponse("Unauthorized - Invalid or missing API key"),
		403: errorJsonResponse("Forbidden - Public key origin validation failed"),
		404: errorJsonResponse("Conversation not found"),
	},
	...runtimeDualAuth({
		parameters: [conversationIdPathParameter],
		includeVisitorIdHeader: true,
	}),
});

export const exportConversationRoute = createRoute({
	method: "get",
	path: "/{conversationId}/export",
	summary: "Download a full conversation export",
	description:
		"Returns the full internal conversation transcript as plain text. This control-plane endpoint requires a private API key.",
	tags: ["Conversations"],
	request: {
		query: emptyQuerySchema,
		params: getConversationRequestSchema,
	},
	responses: {
		200: {
			description: "Conversation export generated successfully",
			content: {
				"text/plain": {
					schema: z.string(),
				},
			},
		},
		401: errorJsonResponse("Unauthorized - Invalid or missing private API key"),
		403: errorJsonResponse("Forbidden - Private API key required"),
		404: errorJsonResponse("Conversation not found"),
	},
	...privateControlAuth({
		parameters: [conversationIdPathParameter],
	}),
});

export const getConversationTimelineRoute = createRoute({
	method: "get",
	path: "/{conversationId}/timeline",
	summary: "Get conversation timeline items",
	description:
		"Fetch paginated timeline items (messages and events) for a conversation in chronological order.",
	tags: ["Conversations"],
	request: {
		query: getConversationTimelineItemsRequestSchema,
	},
	responses: {
		200: {
			description: "Timeline items retrieved successfully",
			content: {
				"application/json": {
					schema: getConversationTimelineItemsResponseSchema,
				},
			},
		},
		400: errorJsonResponse("Invalid request"),
		401: errorJsonResponse("Unauthorized - Invalid or missing API key"),
		403: errorJsonResponse("Forbidden - Public key origin validation failed"),
		404: errorJsonResponse("Conversation not found"),
	},
	...runtimeDualAuth({
		parameters: [conversationIdPathParameter],
		includeVisitorIdHeader: true,
	}),
});

export const CONVERSATION_ROUTES = [
	createConversationRoute,
	listConversationsRoute,
	resolveConversationRoute,
	reopenConversationRoute,
	markConversationAsSpamRoute,
	markConversationAsNotSpamRoute,
	archiveConversationRoute,
	unarchiveConversationRoute,
	markConversationAsReadRoute,
	markConversationAsUnreadRoute,
	updateConversationMetadataRoute,
	updateConversationPriorityRoute,
	updateConversationSentimentRoute,
	updateConversationTitleRoute,
	pauseConversationAiRoute,
	resumeConversationAiRoute,
	joinConversationEscalationRoute,
	listInboxConversationsRoute,
	getConversationContextRoute,
	getConversationRoute,
	markConversationSeenRoute,
	setConversationTypingRoute,
	createConversationRatingRoute,
	getConversationSeenRoute,
	exportConversationRoute,
	getConversationTimelineRoute,
] as const;
