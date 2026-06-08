import type { Database } from "@api/db";
import {
	getSupportConversation,
	listAccessibleWebsites,
	listSupportConversations,
	SupportCapabilityError,
	searchSupportKnowledge,
} from "@api/support-capabilities";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { JWTPayload } from "jose";
import { z } from "zod";

const MCP_KNOWLEDGE_CONTENT_MAX_LENGTH = 1200;

type McpToolContext = {
	db: Database;
	jwt: JWTPayload;
};

function getJwtString(jwt: JWTPayload, key: string): string | null {
	const value = jwt[key];
	return typeof value === "string" ? value : null;
}

function getMcpUserId(jwt: JWTPayload): string {
	if (!jwt.sub) {
		throw new SupportCapabilityError(401, "UNAUTHORIZED", "Missing user");
	}

	return jwt.sub;
}

function toToolResult(value: unknown): CallToolResult {
	return {
		content: [
			{
				type: "text",
				text: JSON.stringify(value, null, 2),
			},
		],
		structuredContent: value as { [key: string]: unknown },
	};
}

function normalizeToolError(error: unknown): Error {
	if (error instanceof SupportCapabilityError) {
		return new Error(error.message);
	}
	if (error instanceof Error) {
		return error;
	}
	return new Error("MCP tool failed");
}

async function runMcpTool(
	ctx: McpToolContext,
	toolName: string,
	websiteId: string | null,
	callback: () => Promise<unknown>
): Promise<CallToolResult> {
	const startedAt = Date.now();
	const userId = getMcpUserId(ctx.jwt);
	const clientId =
		getJwtString(ctx.jwt, "client_id") ?? getJwtString(ctx.jwt, "azp");

	try {
		const result = await callback();
		console.info("[mcp.tool]", {
			toolName,
			userId,
			clientId,
			websiteId,
			durationMs: Date.now() - startedAt,
			status: "success",
		});
		return toToolResult(result);
	} catch (error) {
		console.warn("[mcp.tool]", {
			toolName,
			userId,
			clientId,
			websiteId,
			durationMs: Date.now() - startedAt,
			status: "error",
			error:
				error instanceof SupportCapabilityError
					? error.code
					: "INTERNAL_SERVER_ERROR",
		});
		throw normalizeToolError(error);
	}
}

const websiteSelectorSchema = {
	websiteId: z
		.string()
		.trim()
		.min(1)
		.optional()
		.describe("Website ID. Provide exactly one of websiteId or websiteName."),
	websiteName: z
		.string()
		.trim()
		.min(1)
		.optional()
		.describe(
			"Exact website name. Provide exactly one of websiteId or websiteName."
		),
};

export function registerCossistantMcpTools(
	server: McpServer,
	ctx: McpToolContext
) {
	server.registerTool(
		"cossistant_list_websites",
		{
			title: "List Cossistant websites",
			description: "List websites the signed-in user can access in Cossistant.",
			inputSchema: {
				query: z
					.string()
					.trim()
					.min(1)
					.max(100)
					.optional()
					.describe("Optional filter across website name, slug, or domain."),
				limit: z
					.number()
					.int()
					.min(1)
					.max(50)
					.default(25)
					.describe("Maximum number of websites to return."),
			},
		},
		async ({ query, limit }) =>
			runMcpTool(ctx, "cossistant_list_websites", null, async () => ({
				websites: await listAccessibleWebsites(ctx.db, {
					userId: getMcpUserId(ctx.jwt),
					query,
					limit,
				}),
			}))
	);

	server.registerTool(
		"cossistant_search_knowledge",
		{
			title: "Search Cossistant knowledge",
			description:
				"Search indexed support knowledge for an accessible Cossistant website.",
			inputSchema: {
				...websiteSelectorSchema,
				query: z
					.string()
					.trim()
					.min(1)
					.max(2000)
					.describe("Natural-language support retrieval query."),
				limit: z
					.number()
					.int()
					.min(1)
					.max(8)
					.default(4)
					.describe("Maximum number of knowledge chunks to return."),
				minSimilarity: z
					.number()
					.min(0)
					.max(1)
					.default(0.3)
					.describe("Minimum similarity score to include."),
				knowledgeId: z
					.string()
					.trim()
					.min(1)
					.optional()
					.describe("Optional knowledge entry ID to restrict retrieval."),
			},
		},
		async (input) =>
			runMcpTool(
				ctx,
				"cossistant_search_knowledge",
				input.websiteId ?? null,
				async () =>
					searchSupportKnowledge(ctx.db, {
						userId: getMcpUserId(ctx.jwt),
						websiteId: input.websiteId,
						websiteName: input.websiteName,
						query: input.query,
						limit: input.limit,
						minSimilarity: input.minSimilarity,
						knowledgeId: input.knowledgeId,
						maxContentLength: MCP_KNOWLEDGE_CONTENT_MAX_LENGTH,
					})
			)
	);

	server.registerTool(
		"cossistant_list_conversations",
		{
			title: "List Cossistant conversations",
			description:
				"List recent support conversations for an accessible Cossistant website.",
			inputSchema: {
				...websiteSelectorSchema,
				limit: z
					.number()
					.int()
					.min(1)
					.max(25)
					.default(10)
					.describe("Maximum number of conversations to return."),
				cursor: z.string().nullable().optional(),
				status: z.enum(["open", "resolved", "spam"]).optional(),
				priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
				sentiment: z.enum(["positive", "negative", "neutral"]).optional(),
				q: z.string().trim().min(1).max(200).optional(),
				orderBy: z.enum(["createdAt", "updatedAt"]).default("updatedAt"),
				order: z.enum(["asc", "desc"]).default("desc"),
			},
		},
		async (input) =>
			runMcpTool(
				ctx,
				"cossistant_list_conversations",
				input.websiteId ?? null,
				async () =>
					listSupportConversations(ctx.db, {
						userId: getMcpUserId(ctx.jwt),
						actorUserId: getMcpUserId(ctx.jwt),
						websiteId: input.websiteId,
						websiteName: input.websiteName,
						limit: input.limit,
						cursor: input.cursor ?? null,
						status: input.status,
						priority: input.priority,
						sentiment: input.sentiment,
						q: input.q,
						orderBy: input.orderBy,
						order: input.order,
					})
			)
	);

	server.registerTool(
		"cossistant_get_conversation",
		{
			title: "Get Cossistant conversation",
			description:
				"Get private support context, timeline, and feedback for one conversation.",
			inputSchema: {
				...websiteSelectorSchema,
				conversationId: z
					.string()
					.trim()
					.min(1)
					.describe("Conversation ID to read."),
				timelineLimit: z
					.number()
					.int()
					.min(1)
					.max(50)
					.default(25)
					.describe("Maximum number of timeline items to return."),
				timelineCursor: z.string().nullable().optional(),
				feedbackLimit: z
					.number()
					.int()
					.min(1)
					.max(20)
					.default(10)
					.describe("Maximum number of linked feedback items to return."),
			},
		},
		async (input) =>
			runMcpTool(
				ctx,
				"cossistant_get_conversation",
				input.websiteId ?? null,
				async () =>
					getSupportConversation(ctx.db, {
						userId: getMcpUserId(ctx.jwt),
						actorUserId: getMcpUserId(ctx.jwt),
						websiteId: input.websiteId,
						websiteName: input.websiteName,
						conversationId: input.conversationId,
						timelineLimit: input.timelineLimit,
						timelineCursor: input.timelineCursor ?? null,
						feedbackLimit: input.feedbackLimit,
					})
			)
	);
}
