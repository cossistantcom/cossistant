import {
	aiAgentResponseSchema,
	aiAgentStartTrainingResponseSchema,
	aiAgentTrainingStatusResponseSchema,
} from "@cossistant/types";
import { createRoute } from "@hono/zod-openapi";
import { privateControlAuth } from "../auth";
import { errorJsonResponse } from "../errors";

export const aiAgentIdPathParameter = {
	name: "id",
	in: "path",
	required: true,
	description: "The AI agent ID",
	schema: {
		type: "string",
		pattern: "^[0-9A-HJKMNP-TV-Z]{26}$",
		example: "01JG000000000000000000000",
	},
} as const;

export const getAiAgentTrainingStatusRoute = createRoute({
	method: "get",
	path: "/{id}/training",
	summary: "Get AI agent training status",
	description:
		"Returns the current public and internal knowledge base training status for a specific AI agent.",
	operationId: "getAiAgentTrainingStatus",
	responses: {
		200: {
			description: "AI agent training status retrieved successfully",
			content: {
				"application/json": {
					schema: aiAgentTrainingStatusResponseSchema,
				},
			},
		},
		401: errorJsonResponse("Unauthorized - Invalid or missing private API key"),
		403: errorJsonResponse("Forbidden - Private API key required"),
		404: errorJsonResponse("AI agent not found"),
		500: errorJsonResponse("Internal server error"),
	},
	tags: ["AI Agents"],
	...privateControlAuth({
		parameters: [aiAgentIdPathParameter],
	}),
});

export const startAiAgentTrainingRoute = createRoute({
	method: "post",
	path: "/{id}/training",
	summary: "Start AI agent training",
	description:
		"Queues a retraining job for the AI agent knowledge base. Requires a private API key. When using an unlinked private key, send `X-Actor-User-Id` with a valid website teammate ID.",
	operationId: "startAiAgentTraining",
	responses: {
		202: {
			description: "AI agent training job queued successfully",
			content: {
				"application/json": {
					schema: aiAgentStartTrainingResponseSchema,
				},
			},
		},
		400: errorJsonResponse(
			"Bad request - Missing required actor header for an unlinked private key"
		),
		401: errorJsonResponse("Unauthorized - Invalid or missing private API key"),
		403: errorJsonResponse(
			"Forbidden - Private API key required or actor is not allowed for this website"
		),
		404: errorJsonResponse("AI agent not found"),
		409: errorJsonResponse("Conflict - Training is already in progress"),
		429: errorJsonResponse(
			"Too Many Requests - Training cooldown has not elapsed yet"
		),
		500: errorJsonResponse("Internal server error"),
	},
	tags: ["AI Agents"],
	...privateControlAuth({
		parameters: [aiAgentIdPathParameter],
		includeActorUserIdHeader: true,
	}),
});

export const getAiAgentRoute = createRoute({
	method: "get",
	path: "/{id}",
	summary: "Get an AI agent",
	description:
		"Retrieves a single AI agent by ID for the authenticated website.",
	operationId: "getAiAgent",
	responses: {
		200: {
			description: "AI agent retrieved successfully",
			content: {
				"application/json": {
					schema: aiAgentResponseSchema,
				},
			},
		},
		401: errorJsonResponse("Unauthorized - Invalid or missing private API key"),
		403: errorJsonResponse("Forbidden - Private API key required"),
		404: errorJsonResponse("AI agent not found"),
		500: errorJsonResponse("Internal server error"),
	},
	tags: ["AI Agents"],
	...privateControlAuth({
		parameters: [aiAgentIdPathParameter],
	}),
});

export const AI_AGENT_ROUTES = [
	getAiAgentTrainingStatusRoute,
	startAiAgentTrainingRoute,
	getAiAgentRoute,
] as const;
