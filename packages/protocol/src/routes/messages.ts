import {
	sendTimelineItemRequestSchema,
	sendTimelineItemResponseSchema,
} from "@cossistant/types/api/timeline-item";
import { createRoute } from "@hono/zod-openapi";
import { runtimeDualAuth } from "../auth";
import { errorJsonResponse } from "../errors";

// GET /messages endpoint removed - use /conversations/:id/timeline instead
export const createMessageRoute = createRoute({
	method: "post",
	path: "/",
	summary: "Send a timeline item to a conversation",
	description:
		"Send a new timeline item to an existing conversation. When item.createdAt is omitted, the server assigns the timestamp. Historical timestamps are allowed. Timestamps more than 5 minutes in the future are rejected.",
	tags: ["Messages", "Timeline item"],
	request: {
		body: {
			required: true,
			content: {
				"application/json": {
					schema: sendTimelineItemRequestSchema,
				},
			},
		},
	},
	responses: {
		200: {
			description: "Timeline item sent successfully",
			content: {
				"application/json": {
					schema: sendTimelineItemResponseSchema,
				},
			},
		},
		400: errorJsonResponse(
			"Invalid request or item.createdAt more than 5 minutes in the future"
		),
		401: errorJsonResponse("Unauthorized - Invalid or missing API key"),
		403: errorJsonResponse(
			"Forbidden - Public key origin validation failed or actor constraints failed"
		),
		404: errorJsonResponse("Conversation not found"),
	},
	...runtimeDualAuth({
		includeActorUserIdHeader: true,
		includeVisitorIdHeader: true,
	}),
});

export const MESSAGES_ROUTES = [createMessageRoute] as const;
