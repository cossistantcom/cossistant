import {
	getAiAgentForWebsiteById,
	updateAiAgentTrainingStatus,
} from "@api/db/queries/ai-agent";
import { countIncludedKnowledgeSources } from "@api/db/queries/knowledge";
import { AuthValidationError } from "@api/lib/auth-validation";
import { getPlanForWebsite } from "@api/lib/plans/access";
import {
	type ResolvedPrivateApiKeyActor,
	resolvePrivateApiKeyActorUser,
} from "@api/lib/private-api-key-actor";
import { triggerAiTraining } from "@api/utils/queue-triggers";
import {
	safelyExtractRequestData,
	validateResponse,
} from "@api/utils/validate";
import {
	getAiAgentRoute,
	getAiAgentTrainingStatusRoute,
	startAiAgentTrainingRoute,
} from "@cossistant/protocol/routes";
import {
	type AiAgentTrainingPublicStatus,
	aiAgentResponseSchema,
	aiAgentStartTrainingResponseSchema,
	aiAgentTrainingStatusResponseSchema,
} from "@cossistant/types";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { protectedPrivateApiKeyMiddleware } from "../middleware";
import {
	errorJsonResponse,
	privateControlAuth,
	requirePrivateControlContext,
} from "../openapi";
import type { RestContext } from "../types";

export const aiAgentRouter = new OpenAPIHono<RestContext>();

aiAgentRouter.use("/*", ...protectedPrivateApiKeyMiddleware);

const aiAgentIdPathParameter = {
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

type InternalTrainingStatus =
	| "idle"
	| "pending"
	| "training"
	| "completed"
	| "failed";

function toAiAgentResponse(agent: {
	id: string;
	name: string;
	image: string | null;
	description: string | null;
	basePrompt: string;
	model: string;
	temperature: number | null;
	maxOutputTokens: number | null;
	isActive: boolean;
	lastUsedAt: string | null;
	usageCount: number;
	goals: string[] | null;
	createdAt: string;
	updatedAt: string;
	onboardingCompletedAt: string | null;
}) {
	return {
		id: agent.id,
		name: agent.name,
		image: agent.image,
		description: agent.description,
		basePrompt: agent.basePrompt,
		model: agent.model,
		temperature: agent.temperature,
		maxOutputTokens: agent.maxOutputTokens,
		isActive: agent.isActive,
		lastUsedAt: agent.lastUsedAt,
		usageCount: agent.usageCount,
		goals: agent.goals,
		createdAt: agent.createdAt,
		updatedAt: agent.updatedAt,
		onboardingCompletedAt: agent.onboardingCompletedAt,
	};
}

function getTrainingCooldownMs(
	trainingIntervalMinutes: number | boolean | null
): number {
	if (
		trainingIntervalMinutes === null ||
		trainingIntervalMinutes === true ||
		trainingIntervalMinutes === false ||
		trainingIntervalMinutes <= 0
	) {
		return 0;
	}

	return (trainingIntervalMinutes as number) * 60 * 1000;
}

function getErrorCodeForStatus(status: number): string {
	switch (status) {
		case 400:
			return "BAD_REQUEST";
		case 401:
			return "UNAUTHORIZED";
		case 403:
			return "FORBIDDEN";
		case 404:
			return "NOT_FOUND";
		case 409:
			return "CONFLICT";
		case 429:
			return "TOO_MANY_REQUESTS";
		default:
			return "INTERNAL_SERVER_ERROR";
	}
}

function handleAiAgentRouterError(
	c: Context<RestContext>,
	error: unknown,
	fallbackMessage: string
) {
	if (error instanceof HTTPException) {
		return c.json(
			{
				error: getErrorCodeForStatus(error.status),
				message: error.message,
			},
			error.status as 400 | 401 | 403 | 404 | 409 | 429 | 500
		);
	}

	console.error(fallbackMessage, error);
	return c.json(
		{
			error: "INTERNAL_SERVER_ERROR",
			message: fallbackMessage,
		},
		500
	);
}

function getActorUserIdHeader(c: Context<RestContext>) {
	const actorUserId = c.req.header("X-Actor-User-Id")?.trim();
	return actorUserId && actorUserId.length > 0 ? actorUserId : null;
}

async function requirePrivateAiAgentActor(params: {
	c: Context<RestContext>;
	db: RestContext["Variables"]["db"];
	apiKey: NonNullable<RestContext["Variables"]["apiKey"]>;
	organizationId: string;
	websiteTeamId: string | null | undefined;
	required: boolean;
	missingActorMessage?: string;
	invalidActorMessage?: string;
}): Promise<ResolvedPrivateApiKeyActor | null> {
	try {
		return await resolvePrivateApiKeyActorUser({
			db: params.db,
			apiKey: params.apiKey,
			organizationId: params.organizationId,
			websiteTeamId: params.websiteTeamId,
			explicitActorUserId: getActorUserIdHeader(params.c),
			required: params.required,
			missingActorMessage: params.missingActorMessage,
			invalidActorMessage: params.invalidActorMessage,
		});
	} catch (error) {
		if (error instanceof AuthValidationError) {
			throw new HTTPException(error.statusCode === 400 ? 400 : 403, {
				message: error.message,
			});
		}

		throw error;
	}
}

async function buildTrainingStatusResponse(params: {
	db: RestContext["Variables"]["db"];
	website: RestContext["Variables"]["website"];
	agent: NonNullable<Awaited<ReturnType<typeof getAiAgentForWebsiteById>>>;
}) {
	const internalStatus = (params.agent.trainingStatus ??
		"idle") as InternalTrainingStatus;
	const updatedSourcesCount = await countIncludedKnowledgeSources(params.db, {
		websiteId: params.website.id,
		lastTrainedAt: params.agent.lastTrainedAt ?? null,
	});

	const planInfo = await getPlanForWebsite(params.website);
	const cooldownMs = getTrainingCooldownMs(
		planInfo.features["ai-agent-training-interval"]
	);

	let canTrainAt: string | null = null;
	if (
		internalStatus !== "pending" &&
		internalStatus !== "training" &&
		cooldownMs > 0 &&
		params.agent.lastTrainedAt
	) {
		const cooldownEnd = new Date(
			new Date(params.agent.lastTrainedAt).getTime() + cooldownMs
		);
		if (cooldownEnd > new Date()) {
			canTrainAt = cooldownEnd.toISOString();
		}
	}

	const status: AiAgentTrainingPublicStatus =
		internalStatus === "pending" || internalStatus === "training"
			? "training_ongoing"
			: internalStatus === "failed" || updatedSourcesCount > 0
				? "out_of_date"
				: "trained";

	return validateResponse(
		{
			aiAgentId: params.agent.id,
			status,
			internalStatus,
			progress: params.agent.trainingProgress ?? 0,
			updatedSourcesCount,
			canTrainAt,
			lastTrainedAt: params.agent.lastTrainedAt ?? null,
			trainingStartedAt: params.agent.trainingStartedAt ?? null,
			trainedItemsCount: params.agent.trainedItemsCount ?? null,
			lastError: params.agent.trainingError ?? null,
		},
		aiAgentTrainingStatusResponseSchema
	);
}

aiAgentRouter.openapi(getAiAgentTrainingStatusRoute, async (c) => {
	try {
		const extracted = await safelyExtractRequestData(c);
		const privateContext = requirePrivateControlContext(c, extracted);
		const aiAgentId = c.req.param("id");

		if (privateContext instanceof Response) {
			return privateContext;
		}

		if (!aiAgentId) {
			return c.json({ error: "NOT_FOUND", message: "AI agent not found" }, 404);
		}

		const agent = await getAiAgentForWebsiteById(extracted.db, {
			aiAgentId,
			websiteId: privateContext.website.id,
			organizationId: privateContext.organization.id,
		});

		if (!agent) {
			return c.json({ error: "NOT_FOUND", message: "AI agent not found" }, 404);
		}

		return c.json(
			await buildTrainingStatusResponse({
				db: extracted.db,
				website: privateContext.website,
				agent,
			}),
			200
		);
	} catch (error) {
		return handleAiAgentRouterError(
			c,
			error,
			"Failed to fetch AI agent training status"
		) as never;
	}
});

aiAgentRouter.openapi(startAiAgentTrainingRoute, async (c) => {
	try {
		const extracted = await safelyExtractRequestData(c);
		const privateContext = requirePrivateControlContext(c, extracted);
		const aiAgentId = c.req.param("id");

		if (privateContext instanceof Response) {
			return privateContext;
		}

		if (!aiAgentId) {
			return c.json({ error: "NOT_FOUND", message: "AI agent not found" }, 404);
		}

		const agent = await getAiAgentForWebsiteById(extracted.db, {
			aiAgentId,
			websiteId: privateContext.website.id,
			organizationId: privateContext.organization.id,
		});

		if (!agent) {
			return c.json({ error: "NOT_FOUND", message: "AI agent not found" }, 404);
		}

		const actor = await requirePrivateAiAgentActor({
			c,
			db: extracted.db,
			apiKey: privateContext.apiKey,
			organizationId: privateContext.organization.id,
			websiteTeamId: privateContext.website.teamId,
			required: true,
		});

		if (!actor) {
			throw new HTTPException(403, {
				message: "Actor user is not allowed for this website",
			});
		}

		if (
			agent.trainingStatus === "pending" ||
			agent.trainingStatus === "training"
		) {
			return c.json(
				{
					error: "CONFLICT",
					message: "Training is already in progress",
				},
				409
			);
		}

		const planInfo = await getPlanForWebsite(privateContext.website);
		const cooldownMs = getTrainingCooldownMs(
			planInfo.features["ai-agent-training-interval"]
		);
		if (cooldownMs > 0 && agent.lastTrainedAt) {
			const cooldownEnd = new Date(
				new Date(agent.lastTrainedAt).getTime() + cooldownMs
			);

			if (cooldownEnd > new Date()) {
				c.header(
					"Retry-After",
					String(
						Math.max(1, Math.ceil((cooldownEnd.getTime() - Date.now()) / 1000))
					)
				);
				return c.json(
					{
						error: "TOO_MANY_REQUESTS",
						message: `Your plan allows training every ${Math.round(cooldownMs / 60_000)} minutes. Try again after ${cooldownEnd.toISOString()}`,
					},
					429
				);
			}
		}

		await updateAiAgentTrainingStatus(extracted.db, {
			aiAgentId: agent.id,
			trainingStatus: "pending",
			trainingProgress: 0,
			trainingError: null,
		});

		const jobId = await triggerAiTraining({
			websiteId: privateContext.website.id,
			organizationId: privateContext.organization.id,
			aiAgentId: agent.id,
			triggeredBy: actor.userId,
		});

		return c.json(
			validateResponse(
				{
					aiAgentId: agent.id,
					jobId,
					status: "training_ongoing" as const,
					internalStatus: "pending" as const,
					progress: 0,
				},
				aiAgentStartTrainingResponseSchema
			),
			202
		);
	} catch (error) {
		return handleAiAgentRouterError(
			c,
			error,
			"Failed to start AI agent training"
		) as never;
	}
});

aiAgentRouter.openapi(getAiAgentRoute, async (c) => {
	try {
		const extracted = await safelyExtractRequestData(c);
		const privateContext = requirePrivateControlContext(c, extracted);
		const aiAgentId = c.req.param("id");

		if (privateContext instanceof Response) {
			return privateContext;
		}

		if (!aiAgentId) {
			return c.json({ error: "NOT_FOUND", message: "AI agent not found" }, 404);
		}

		const agent = await getAiAgentForWebsiteById(extracted.db, {
			aiAgentId,
			websiteId: privateContext.website.id,
			organizationId: privateContext.organization.id,
		});

		if (!agent) {
			return c.json({ error: "NOT_FOUND", message: "AI agent not found" }, 404);
		}

		return c.json(
			validateResponse(toAiAgentResponse(agent), aiAgentResponseSchema),
			200
		);
	} catch (error) {
		return handleAiAgentRouterError(
			c,
			error,
			"Failed to fetch AI agent"
		) as never;
	}
});
