import { upsertVisitor } from "@api/db/queries";
import { listActiveAiAgentSummariesForWebsite } from "@api/db/queries/ai-agent";
import { getContactForVisitor } from "@api/db/queries/contact";
import { getWebsiteMembers as getWebsiteMembersForApi } from "@api/db/queries/member";
import { visitor as visitorTable } from "@api/db/schema/website";
import { listWebsiteAccessUsers } from "@api/lib/team-seats";
import { generateULID } from "@api/utils/db/ids";
import { computeMetadataHash } from "@api/utils/metadata-hash";
import {
	safelyExtractRequestData,
	validateResponse,
} from "@api/utils/validate";
import { getMostRecentLastOnlineAt } from "@api/utils/website";
import { normalizeHumanAgentName } from "@cossistant/core";
import {
	publicWebsiteResponseSchema,
	websiteTeamMembersResponseSchema,
} from "@cossistant/types";
import { OpenAPIHono } from "@hono/zod-openapi";
import { protectedPublicApiKeyMiddleware } from "../middleware";
import {
	errorJsonResponse,
	privateControlAuth,
	requirePrivateControlContext,
	runtimeDualAuth,
} from "../openapi";
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
				listActiveAiAgentSummariesForWebsite(db, {
					websiteId: website.id,
				}),
			]);

		const availableHumanAgents = websiteAccessUsers
			.slice(0, 3)
			.map((humanAgent) => ({
				id: humanAgent.userId,
				name: normalizeHumanAgentName(humanAgent.name),
				email: humanAgent.email ?? null,
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
					defaultLanguage: website.defaultLanguage,
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

websiteRouter.openapi(
	{
		method: "get",
		path: "/team-members",
		summary: "List website team members",
		description:
			"Returns the website-access teammates that can be linked to private API keys or used as actor IDs on actor-aware private API routes.",
		operationId: "listWebsiteTeamMembers",
		responses: {
			200: {
				description: "Website team members retrieved successfully",
				content: {
					"application/json": {
						schema: websiteTeamMembersResponseSchema,
					},
				},
			},
			401: errorJsonResponse(
				"Unauthorized - Invalid or missing private API key"
			),
			403: errorJsonResponse("Forbidden - Private API key required"),
			500: errorJsonResponse("Internal server error"),
		},
		tags: ["Website"],
		...privateControlAuth(),
	},
	async (c) => {
		try {
			const context = await safelyExtractRequestData(c);
			const privateContext = requirePrivateControlContext(c, context);

			if (privateContext instanceof Response) {
				return privateContext;
			}

			const members = privateContext.website.teamId
				? await getWebsiteMembersForApi(context.db, {
						organizationId: privateContext.organization.id,
						websiteTeamId: privateContext.website.teamId,
					})
				: [];

			return c.json(
				validateResponse(
					{
						members,
					},
					websiteTeamMembersResponseSchema
				),
				200
			);
		} catch (error) {
			console.error("Error listing website team members:", error);
			return c.json(
				{
					error: "INTERNAL_SERVER_ERROR",
					message: "Failed to list website team members",
				},
				500
			);
		}
	}
);
