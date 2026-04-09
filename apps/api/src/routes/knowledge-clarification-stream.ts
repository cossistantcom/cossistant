import { type DatabaseClient, db as defaultDb } from "@api/db";
import { getAiAgentForWebsite } from "@api/db/queries/ai-agent";
import { getKnowledgeById } from "@api/db/queries/knowledge";
import {
	createKnowledgeClarificationTurn,
	getKnowledgeClarificationRequestById,
	listKnowledgeClarificationTurns,
	updateKnowledgeClarificationRequest,
} from "@api/db/queries/knowledge-clarification";
import { getWebsiteBySlugWithAccess } from "@api/db/queries/website";
import type { KnowledgeClarificationRequestSelect } from "@api/db/schema/knowledge-clarification";
import type { auth } from "@api/lib/auth";
import {
	applyApiBrowserCorsResponseHeaders,
	createApiBrowserPreflightResponse,
} from "@api/lib/browser-cors";
import {
	createKnowledgeClarificationAuditEntry,
	emitConversationClarificationUpdate,
	loadKnowledgeClarificationRuntime,
	prepareConversationKnowledgeClarificationStart,
	prepareFaqKnowledgeClarificationStart,
	startKnowledgeClarificationStepStream,
	toKnowledgeClarificationStep,
	toKnowledgeClarificationStreamStepResponse,
} from "@api/services/knowledge-clarification";
import { loadConversationContext } from "@api/trpc/utils/conversation";
import { knowledgeClarificationStreamStepRequestSchema } from "@cossistant/types";
import { OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";

const textEncoder = new TextEncoder();
const STREAM_STEP_ALLOW_METHODS = ["POST", "OPTIONS"] as const;

type StreamRouterContext = {
	Variables: {
		user: typeof auth.$Infer.Session.user | null;
		session: typeof auth.$Infer.Session.session | null;
	};
};

type KnowledgeClarificationStreamRouterDeps = {
	db: typeof defaultDb;
	getAiAgentForWebsite: typeof getAiAgentForWebsite;
	createKnowledgeClarificationTurn: typeof createKnowledgeClarificationTurn;
	getKnowledgeClarificationRequestById: typeof getKnowledgeClarificationRequestById;
	listKnowledgeClarificationTurns: typeof listKnowledgeClarificationTurns;
	updateKnowledgeClarificationRequest: typeof updateKnowledgeClarificationRequest;
	getKnowledgeById: typeof getKnowledgeById;
	getWebsiteBySlugWithAccess: typeof getWebsiteBySlugWithAccess;
	createKnowledgeClarificationAuditEntry: typeof createKnowledgeClarificationAuditEntry;
	emitConversationClarificationUpdate: typeof emitConversationClarificationUpdate;
	loadKnowledgeClarificationRuntime: typeof loadKnowledgeClarificationRuntime;
	prepareConversationKnowledgeClarificationStart: typeof prepareConversationKnowledgeClarificationStart;
	prepareFaqKnowledgeClarificationStart: typeof prepareFaqKnowledgeClarificationStart;
	startKnowledgeClarificationStepStream: typeof startKnowledgeClarificationStepStream;
	loadConversationContext: typeof loadConversationContext;
	toKnowledgeClarificationStep: typeof toKnowledgeClarificationStep;
	toKnowledgeClarificationStreamStepResponse: typeof toKnowledgeClarificationStreamStepResponse;
};

const defaultDeps: KnowledgeClarificationStreamRouterDeps = {
	db: defaultDb,
	getAiAgentForWebsite,
	createKnowledgeClarificationTurn,
	getKnowledgeClarificationRequestById,
	listKnowledgeClarificationTurns,
	updateKnowledgeClarificationRequest,
	getKnowledgeById,
	getWebsiteBySlugWithAccess,
	createKnowledgeClarificationAuditEntry,
	emitConversationClarificationUpdate,
	loadKnowledgeClarificationRuntime,
	prepareConversationKnowledgeClarificationStart,
	prepareFaqKnowledgeClarificationStart,
	startKnowledgeClarificationStepStream,
	loadConversationContext,
	toKnowledgeClarificationStep,
	toKnowledgeClarificationStreamStepResponse,
};

function createJsonResponse(payload: unknown, status = 200): Response {
	return new Response(JSON.stringify(payload), {
		status,
		headers: {
			"Cache-Control": "no-store",
			"Content-Type": "application/json; charset=utf-8",
		},
	});
}

function createStreamEnvelopeResponse(params: {
	requestId: string;
	textStream: AsyncIterable<string>;
	finalize: () => Promise<
		ReturnType<
			KnowledgeClarificationStreamRouterDeps["toKnowledgeClarificationStreamStepResponse"]
		> extends infer T
			? T
			: never
	>;
}): Response {
	return new Response(
		new ReadableStream({
			async start(controller) {
				const write = (value: string) => {
					controller.enqueue(textEncoder.encode(value));
				};

				const iterator = params.textStream[Symbol.asyncIterator]();
				let firstChunk: string | null = null;

				try {
					while (true) {
						const next = await iterator.next();
						if (next.done) {
							write(JSON.stringify(await params.finalize()));
							controller.close();
							return;
						}

						if (next.value.length === 0) {
							continue;
						}

						firstChunk = next.value;
						break;
					}
				} catch (error) {
					try {
						write(JSON.stringify(await params.finalize()));
						controller.close();
						return;
					} catch {
						controller.error(error);
						return;
					}
				}

				try {
					write(`{"requestId":${JSON.stringify(params.requestId)},"decision":`);
					write(firstChunk);

					while (true) {
						const next = await iterator.next();
						if (next.done) {
							break;
						}

						write(next.value);
					}

					const finalResponse = await params.finalize();
					write(`,"status":${JSON.stringify(finalResponse.status)}`);
					write(`,"updatedAt":${JSON.stringify(finalResponse.updatedAt)}`);
					write(',"request":');
					write(JSON.stringify(finalResponse.request));
					write("}");
					controller.close();
				} catch (error) {
					controller.error(error);
				}
			},
		}),
		{
			headers: {
				"Cache-Control": "no-store",
				"Content-Type": "application/json; charset=utf-8",
			},
		}
	);
}

function applyStreamStepCorsHeaders(
	response: Response,
	requestOrigin?: string | null
) {
	applyApiBrowserCorsResponseHeaders({
		headers: response.headers,
		requestOrigin,
	});

	return response;
}

async function loadWebsite(
	deps: KnowledgeClarificationStreamRouterDeps,
	params: { userId: string; websiteSlug: string }
) {
	const website = await deps.getWebsiteBySlugWithAccess(deps.db, {
		userId: params.userId,
		websiteSlug: params.websiteSlug,
	});
	if (!website) {
		throw new HTTPException(404, {
			message: "Website not found or access denied",
		});
	}

	return website;
}

async function loadWebsiteAndAiAgent(
	deps: KnowledgeClarificationStreamRouterDeps,
	params: {
		userId: string;
		websiteSlug: string;
	}
) {
	const website = await loadWebsite(deps, params);
	const aiAgent = await deps.getAiAgentForWebsite(deps.db, {
		websiteId: website.id,
		organizationId: website.organizationId,
	});
	if (!aiAgent) {
		throw new HTTPException(400, {
			message: "AI agent not found for this website",
		});
	}

	return { website, aiAgent };
}

async function loadClarificationRequest(
	deps: KnowledgeClarificationStreamRouterDeps,
	params: {
		userId: string;
		websiteSlug: string;
		requestId: string;
	}
) {
	const website = await loadWebsite(deps, {
		userId: params.userId,
		websiteSlug: params.websiteSlug,
	});
	const request = await deps.getKnowledgeClarificationRequestById(deps.db, {
		requestId: params.requestId,
		websiteId: website.id,
	});
	if (!request) {
		throw new HTTPException(404, {
			message: "Clarification request not found",
		});
	}

	return { website, request };
}

function createConversationClarificationProgressReporter(
	deps: KnowledgeClarificationStreamRouterDeps,
	params: {
		request: Awaited<
			ReturnType<
				KnowledgeClarificationStreamRouterDeps["getKnowledgeClarificationRequestById"]
			>
		>;
		conversation: Awaited<
			ReturnType<
				KnowledgeClarificationStreamRouterDeps["loadKnowledgeClarificationRuntime"]
			>
		>["conversation"];
	}
) {
	return async (
		progress: Parameters<
			KnowledgeClarificationStreamRouterDeps["emitConversationClarificationUpdate"]
		>[0]["progress"]
	) => {
		await deps.emitConversationClarificationUpdate({
			db: deps.db,
			conversation: params.conversation,
			request: params.request,
			aiAgentId: null,
			progress: progress ?? null,
		});
	};
}

async function emitRetryableConversationClarificationFailure(
	deps: KnowledgeClarificationStreamRouterDeps,
	params: {
		websiteId: string;
		requestId: string;
		conversation: Awaited<
			ReturnType<
				KnowledgeClarificationStreamRouterDeps["loadKnowledgeClarificationRuntime"]
			>
		>["conversation"];
	}
) {
	const failedRequest = await deps.getKnowledgeClarificationRequestById(
		deps.db,
		{
			requestId: params.requestId,
			websiteId: params.websiteId,
		}
	);

	await deps.emitConversationClarificationUpdate({
		db: deps.db,
		conversation: params.conversation,
		request: failedRequest,
		aiAgentId: null,
	});
}

async function createFinalizedStreamResponse(
	deps: KnowledgeClarificationStreamRouterDeps,
	params: {
		requestId: string;
		websiteId: string;
		stream: Awaited<
			ReturnType<
				KnowledgeClarificationStreamRouterDeps["startKnowledgeClarificationStepStream"]
			>
		>;
		conversation: Awaited<
			ReturnType<
				KnowledgeClarificationStreamRouterDeps["loadKnowledgeClarificationRuntime"]
			>
		>["conversation"];
	}
): Promise<Response> {
	let finalResponsePromise: Promise<
		ReturnType<
			KnowledgeClarificationStreamRouterDeps["toKnowledgeClarificationStreamStepResponse"]
		>
	> | null = null;

	const finalize = async () => {
		if (!finalResponsePromise) {
			finalResponsePromise = (async () => {
				try {
					const step = await params.stream.finalize();
					if (params.conversation) {
						await deps.emitConversationClarificationUpdate({
							db: deps.db,
							conversation: params.conversation,
							request: step.request,
							aiAgentId: null,
						});
					}
					return deps.toKnowledgeClarificationStreamStepResponse(step);
				} catch (error) {
					if (params.conversation) {
						await emitRetryableConversationClarificationFailure(deps, {
							websiteId: params.websiteId,
							requestId: params.requestId,
							conversation: params.conversation,
						});
					}
					throw error;
				}
			})();
		}

		return finalResponsePromise;
	};

	return createStreamEnvelopeResponse({
		requestId: params.requestId,
		textStream: params.stream.textStream,
		finalize,
	});
}

async function handleInteractiveClarificationAction(
	deps: KnowledgeClarificationStreamRouterDeps,
	params: {
		userId: string;
		websiteSlug: string;
		requestId: string;
		expectedStepIndex?: number;
		allowedStatuses: KnowledgeClarificationRequestSelect["status"][];
		invalidStatusMessage: string;
		action: "answer" | "skip" | "retry";
		createTurn?: (db: DatabaseClient) => Promise<void>;
		auditText?: string;
	}
): Promise<Response> {
	const { website, request } = await loadClarificationRequest(deps, {
		userId: params.userId,
		websiteSlug: params.websiteSlug,
		requestId: params.requestId,
	});

	if (request.status === "applied" || request.status === "dismissed") {
		throw new HTTPException(400, {
			message: "This clarification request can no longer be changed",
		});
	}

	const analyzingRequest = await deps.db.transaction(async (tx) => {
		const claimedRequest = await deps.updateKnowledgeClarificationRequest(tx, {
			requestId: request.id,
			currentStatuses: params.allowedStatuses,
			expectedStepIndex: params.expectedStepIndex,
			updates: {
				status: "analyzing",
				lastError: null,
			},
		});
		if (!claimedRequest) {
			return null;
		}

		if (params.createTurn) {
			await params.createTurn(tx);
		}

		return claimedRequest;
	});

	if (!analyzingRequest) {
		const currentRequest = await deps.getKnowledgeClarificationRequestById(
			deps.db,
			{
				requestId: request.id,
				websiteId: website.id,
			}
		);
		if (!currentRequest) {
			throw new HTTPException(404, {
				message: "Clarification request not found",
			});
		}

		if (
			currentRequest.status === "applied" ||
			currentRequest.status === "dismissed"
		) {
			throw new HTTPException(400, {
				message: "This clarification request can no longer be changed",
			});
		}

		const turns = await deps.listKnowledgeClarificationTurns(deps.db, {
			requestId: currentRequest.id,
		});
		const currentStep = deps.toKnowledgeClarificationStep({
			request: currentRequest,
			turns,
		});

		console.warn(
			"[KnowledgeClarification] Interactive submit missed status claim",
			{
				requestId: currentRequest.id,
				action: params.action,
				expectedStepIndex: params.expectedStepIndex,
				currentStatus: currentRequest.status,
				currentStepIndex: currentRequest.stepIndex,
				hasHumanTurn: turns.some(
					(turn) => turn.role === "human_answer" || turn.role === "human_skip"
				),
			}
		);

		if (!currentStep) {
			throw new HTTPException(400, {
				message: params.invalidStatusMessage,
			});
		}

		return createJsonResponse(
			deps.toKnowledgeClarificationStreamStepResponse(currentStep)
		);
	}

	const runtime = await deps.loadKnowledgeClarificationRuntime({
		db: deps.db,
		organizationId: website.organizationId,
		websiteId: website.id,
		request: analyzingRequest,
	});
	const progressReporter = createConversationClarificationProgressReporter(
		deps,
		{
			request: analyzingRequest,
			conversation: runtime.conversation,
		}
	);

	await deps.emitConversationClarificationUpdate({
		db: deps.db,
		conversation: runtime.conversation,
		request: analyzingRequest,
		aiAgentId: null,
	});

	if (params.auditText) {
		await deps.createKnowledgeClarificationAuditEntry({
			db: deps.db,
			request: analyzingRequest,
			conversation: runtime.conversation,
			actor: { userId: params.userId },
			text: params.auditText,
		});
	}

	const stream = await deps.startKnowledgeClarificationStepStream({
		db: deps.db,
		request: analyzingRequest,
		aiAgent: runtime.aiAgent,
		conversation: runtime.conversation,
		targetKnowledge: runtime.targetKnowledge,
		progressReporter,
	});

	return createFinalizedStreamResponse(deps, {
		requestId: analyzingRequest.id,
		websiteId: website.id,
		stream,
		conversation: runtime.conversation,
	});
}

export function createKnowledgeClarificationStreamRouter(
	depsInput: Partial<KnowledgeClarificationStreamRouterDeps> = {}
) {
	const deps: KnowledgeClarificationStreamRouterDeps = {
		...defaultDeps,
		...depsInput,
	};
	const router = new OpenAPIHono<StreamRouterContext>();

	router.use("/stream-step", async (c, next) => {
		const requestOrigin = c.req.header("origin");

		if (c.req.method === "OPTIONS") {
			return createApiBrowserPreflightResponse({
				requestOrigin,
				requestHeaders: c.req.header("Access-Control-Request-Headers"),
				allowMethods: STREAM_STEP_ALLOW_METHODS,
			});
		}

		await next();
		applyApiBrowserCorsResponseHeaders({
			headers: c.res.headers,
			requestOrigin,
		});
	});

	router.onError((error, c) => {
		const response =
			error instanceof HTTPException
				? error.getResponse()
				: createJsonResponse(
						{
							error: "Failed to continue clarification flow",
						},
						500
					);

		return applyStreamStepCorsHeaders(response, c.req.header("origin"));
	});

	router.post("/stream-step", async (c) => {
		const user = c.get("user");
		if (!user) {
			return c.text("Unauthorized", 401);
		}

		let body: unknown;

		try {
			body = await c.req.json();
		} catch {
			return c.text("Invalid JSON body", 400);
		}

		const parsedInput =
			knowledgeClarificationStreamStepRequestSchema.safeParse(body);
		if (!parsedInput.success) {
			return c.text("Invalid clarification stream request", 400);
		}

		const input = parsedInput.data;

		try {
			switch (input.action) {
				case "start_conversation": {
					const { website, conversation } = await deps.loadConversationContext(
						deps.db,
						user.id,
						{
							websiteSlug: input.websiteSlug,
							conversationId: input.conversationId,
						}
					);
					const aiAgent = await deps.getAiAgentForWebsite(deps.db, {
						websiteId: website.id,
						organizationId: website.organizationId,
					});
					if (!aiAgent) {
						throw new HTTPException(400, {
							message: "AI agent not found for this website",
						});
					}

					const prepared =
						await deps.prepareConversationKnowledgeClarificationStart({
							db: deps.db,
							organizationId: website.organizationId,
							websiteId: website.id,
							aiAgent,
							conversation,
							topicSummary: input.topicSummary,
							actor: { userId: user.id },
							creationMode: "manual",
						});

					if (prepared.kind === "suppressed_duplicate") {
						throw new HTTPException(409, {
							message:
								"This clarification trigger already maps to a completed request",
						});
					}

					if (prepared.kind === "step") {
						await deps.emitConversationClarificationUpdate({
							db: deps.db,
							conversation,
							request: prepared.step.request,
							aiAgentId: null,
						});

						return createJsonResponse(
							deps.toKnowledgeClarificationStreamStepResponse(prepared.step)
						);
					}

					await deps.emitConversationClarificationUpdate({
						db: deps.db,
						conversation,
						request: prepared.request,
						aiAgentId: null,
					});

					const stream = await deps.startKnowledgeClarificationStepStream({
						db: deps.db,
						request: prepared.request,
						aiAgent,
						conversation,
					});

					return createFinalizedStreamResponse(deps, {
						requestId: prepared.request.id,
						websiteId: website.id,
						stream,
						conversation,
					});
				}

				case "start_faq": {
					const { website, aiAgent } = await loadWebsiteAndAiAgent(deps, {
						userId: user.id,
						websiteSlug: input.websiteSlug,
					});
					const targetKnowledge = await deps.getKnowledgeById(deps.db, {
						id: input.knowledgeId,
						websiteId: website.id,
					});
					if (!targetKnowledge) {
						throw new HTTPException(404, {
							message: "FAQ not found",
						});
					}
					if (targetKnowledge.type !== "faq") {
						throw new HTTPException(400, {
							message: "Only FAQ knowledge can be deepened in this flow",
						});
					}

					const payload =
						typeof targetKnowledge.payload === "object" &&
						targetKnowledge.payload !== null
							? (targetKnowledge.payload as Record<string, unknown>)
							: null;
					const defaultTopicSummary =
						input.topicSummary?.trim() ||
						(typeof payload?.question === "string"
							? `Clarify FAQ: ${payload.question}`
							: "Clarify this FAQ");

					const prepared = await deps.prepareFaqKnowledgeClarificationStart({
						db: deps.db,
						organizationId: website.organizationId,
						websiteId: website.id,
						aiAgent,
						topicSummary: defaultTopicSummary,
						targetKnowledge,
					});

					if (prepared.kind === "step") {
						return createJsonResponse(
							deps.toKnowledgeClarificationStreamStepResponse(prepared.step)
						);
					}

					const stream = await deps.startKnowledgeClarificationStepStream({
						db: deps.db,
						request: prepared.request,
						aiAgent,
						targetKnowledge,
					});

					return createFinalizedStreamResponse(deps, {
						requestId: prepared.request.id,
						websiteId: website.id,
						stream,
						conversation: null,
					});
				}

				case "answer": {
					const answerText =
						input.selectedAnswer?.trim() ||
						input.freeAnswer?.trim() ||
						"No answer";

					return handleInteractiveClarificationAction(deps, {
						action: "answer",
						userId: user.id,
						websiteSlug: input.websiteSlug,
						requestId: input.requestId,
						expectedStepIndex: input.expectedStepIndex,
						allowedStatuses: ["awaiting_answer", "deferred"],
						invalidStatusMessage:
							"This clarification request is not waiting for an answer",
						createTurn: async (db) => {
							await deps.createKnowledgeClarificationTurn(db, {
								requestId: input.requestId,
								role: "human_answer",
								selectedAnswer: input.selectedAnswer?.trim() || null,
								freeAnswer: input.freeAnswer?.trim() || null,
							});
						},
						auditText: `Knowledge clarification answered: ${answerText}`,
					});
				}

				case "skip":
					return handleInteractiveClarificationAction(deps, {
						action: "skip",
						userId: user.id,
						websiteSlug: input.websiteSlug,
						requestId: input.requestId,
						expectedStepIndex: input.expectedStepIndex,
						allowedStatuses: ["awaiting_answer", "deferred"],
						invalidStatusMessage:
							"This clarification request is not waiting for an answer",
						createTurn: async (db) => {
							await deps.createKnowledgeClarificationTurn(db, {
								requestId: input.requestId,
								role: "human_skip",
								selectedAnswer: null,
								freeAnswer: null,
							});
						},
						auditText: "Knowledge clarification question skipped.",
					});

				case "retry":
					return handleInteractiveClarificationAction(deps, {
						action: "retry",
						userId: user.id,
						websiteSlug: input.websiteSlug,
						requestId: input.requestId,
						allowedStatuses: ["retry_required"],
						invalidStatusMessage:
							"This clarification request cannot be retried",
					});

				default:
					throw new HTTPException(400, {
						message: "Unsupported clarification stream action",
					});
			}
		} catch (error) {
			if (error instanceof HTTPException) {
				throw error;
			}

			throw new HTTPException(500, {
				message:
					error instanceof Error
						? error.message
						: "Failed to continue clarification flow",
			});
		}
	});

	return router;
}

export const knowledgeClarificationStreamRouter =
	createKnowledgeClarificationStreamRouter();
