import { upsertVisitor } from "@api/db/queries";
import { getContactForVisitor } from "@api/db/queries/contact";
import { aiAgent } from "@api/db/schema/ai-agent";
import { visitor as visitorTable } from "@api/db/schema/website";
import { listWebsiteAccessUsers } from "@api/lib/team-seats";
import { generateULID } from "@api/utils/db/ids";
import { computeMetadataHash } from "@api/utils/metadata-hash";
import {
	safelyExtractRequestData,
	validateResponse,
} from "@api/utils/validate";
import { getMostRecentLastOnlineAt } from "@api/utils/website";
import { normalizeHumanAgentName } from "@plasma/core";
import { publicWebsiteResponseSchema } from "@plasma/types";
import { OpenAPIHono } from "@hono/zod-openapi";
import { and, eq, isNull } from "drizzle-orm";
import { protectedPublicApiKeyMiddleware } from "../middleware";
import { errorJsonResponse, runtimeDualAuth } from "../openapi";
import type { RestContext } from "../types";

export const websiteRouter = new OpenAPIHono<RestContext>();

websiteRouter.use("/*", ...protectedPublicApiKeyMiddleware);

// GET /website - Get website information linked to the API key
websiteRouter.openapi(
	{
		method: "get",
		path: "/",
		summary: "Get website information",
		description:
			"Returns the website information associated with the provided API key. This endpoint supports both public and private API keys with different authentication methods.",
		responses: {
			200: {
				description: "Website information successfully retrieved",
				content: {
					"application/json": {
						schema: publicWebsiteResponseSchema,
					},
				},
			},
			401: errorJsonResponse("Unauthorized - Invalid or missing API key"),
			403: errorJsonResponse(
				"Forbidden - Origin validation failed for public key or domain not whitelisted"
			),
			404: errorJsonResponse("Website not found for this API key"),
		},
		tags: ["Website"],
		...runtimeDualAuth({ includeVisitorIdHeader: true }),
	},
	async (c) => {
		const { db, website, apiKey, visitorIdHeader } =
			await safelyExtractRequestData(c);

		// if visitorIdHeader is not provided, generate a new one
		const visitorId = visitorIdHeader ?? generateULID();

		const [visitor, websiteAccessUsers, contact, websiteAiAgents] =
			await Promise.all([
				upsertVisitor(db, {
					websiteId: website.id,
					organizationId: website.organizationId,
					visitorId,
					isTest: apiKey.isTest,
				}),
				website.teamId
					? listWebsiteAccessUsers(db, {
							organizationId: website.organizationId,
							teamId: website.teamId,
						})
					: Promise.resolve([]),
				getContactForVisitor(db, {
					visitorId,
					websiteId: website.id,
				}),
				// Query active AI agents for this website
				db.query.aiAgent.findMany({
					where: and(
						eq(aiAgent.websiteId, website.id),
						eq(aiAgent.isActive, true),
						isNull(aiAgent.deletedAt)
					),
					columns: {
						id: true,
						name: true,
						image: true,
					},
				}),
			]);

		const availableHumanAgents = websiteAccessUsers
			.slice(0, 3)
			.map((humanAgent) => ({
				id: humanAgent.userId,
				name: normalizeHumanAgentName(humanAgent.name),
				image: humanAgent.image,
				lastSeenAt: humanAgent.lastSeenAt?.toISOString() ?? null,
			}));

		// Map AI agents to the AvailableAIAgent format
		const availableAIAgents = websiteAiAgents.map((agent) => ({
			id: agent.id,
			name: agent.name,
			image: agent.image ?? null,
		}));

		// iso string indicating support activity - uses most recent lastSeenAt from available human agents
		const lastOnlineAt = getMostRecentLastOnlineAt(availableHumanAgents);

		return c.json(
			validateResponse(
				{
					id: website.id,
					name: website.name,
					domain: website.domain,
					description: website.description,
					logoUrl: website.logoUrl,
					organizationId: website.organizationId,
					status: website.status,
					lastOnlineAt,
					availableHumanAgents,
					availableAIAgents,
					visitor: {
						id: visitor.id,
						isBlocked: Boolean(visitor.blockedAt),
						language: visitor.language,
						contact: contact
							? {
									id: contact.id,
									name: contact.name,
									email: contact.email,
									image: contact.image,
									metadataHash: computeMetadataHash(
										contact.metadata as Record<string, unknown> | null
									),
								}
							: null,
					},
				},
				publicWebsiteResponseSchema
			),
			200
		);
	}
);
