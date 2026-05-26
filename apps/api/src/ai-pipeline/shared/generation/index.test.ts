import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const createModelMock = mock((modelId: string) => modelId);
let mockOpenRouterBillingSource: "cossistant" | "customer_openrouter" =
	"cossistant";
let mockOpenRouterFallbackAfterError = false;
class OpenRouterByokFallbackRequiredErrorMock extends Error {
	readonly billingSource = "customer_openrouter" as const;
	readonly errorCode: string;
	readonly fallbackEligible = true;
	readonly alreadyRecorded: boolean;

	constructor(params: { errorCode: string; alreadyRecorded?: boolean }) {
		super("Customer OpenRouter key failed and requires fallback.");
		this.name = "OpenRouterByokFallbackRequiredError";
		this.errorCode = params.errorCode;
		this.alreadyRecorded = params.alreadyRecorded === true;
	}
}
const runWithOpenRouterByokFallbackMock = mock(
	async (params: {
		modelId: string;
		options?: {
			openRouterByokMode?: "auto" | "customer" | "cossistant_platform";
		};
		fallbackStrategy?: "inline" | "throw";
		operation: (resolution: {
			model: string;
			billingSource:
				| "cossistant"
				| "customer_openrouter"
				| "cossistant_platform";
			fallbackFromBillingSource?: "customer_openrouter";
			fallbackErrorCode?: string;
			usedOpenRouterByokFallback?: boolean;
		}) => Promise<unknown>;
		onResolution?: (resolution: {
			model: string;
			billingSource:
				| "cossistant"
				| "customer_openrouter"
				| "cossistant_platform";
			fallbackFromBillingSource?: "customer_openrouter";
			fallbackErrorCode?: string;
			usedOpenRouterByokFallback?: boolean;
		}) => void;
		beforeOperation?: (resolution: {
			model: string;
			billingSource:
				| "cossistant"
				| "customer_openrouter"
				| "cossistant_platform";
			fallbackFromBillingSource?: "customer_openrouter";
			fallbackErrorCode?: string;
			usedOpenRouterByokFallback?: boolean;
		}) => Promise<void> | void;
	}) => {
		const billingSource =
			params.options?.openRouterByokMode === "cossistant_platform"
				? ("cossistant_platform" as const)
				: mockOpenRouterBillingSource;
		const resolution = {
			model: createModelMock(params.modelId),
			billingSource,
		};
		params.onResolution?.(resolution);
		await params.beforeOperation?.(resolution);
		try {
			return {
				result: await params.operation(resolution),
				billingSource: resolution.billingSource,
			};
		} catch (error) {
			if (
				params.fallbackStrategy === "throw" &&
				resolution.billingSource === "customer_openrouter"
			) {
				throw new OpenRouterByokFallbackRequiredErrorMock({
					errorCode:
						error instanceof Error && error.name === "AbortError"
							? "AbortError"
							: "provider_error",
				});
			}

			if (
				!mockOpenRouterFallbackAfterError ||
				resolution.billingSource !== "customer_openrouter"
			) {
				throw error;
			}

			const fallbackResolution = {
				model: createModelMock(params.modelId),
				billingSource: "cossistant" as const,
				fallbackFromBillingSource: "customer_openrouter" as const,
				fallbackErrorCode: "provider_error",
				usedOpenRouterByokFallback: true,
			};
			params.onResolution?.(fallbackResolution);
			await params.beforeOperation?.(fallbackResolution);
			return {
				result: await params.operation(fallbackResolution),
				billingSource: "cossistant" as const,
				fallbackFromBillingSource: "customer_openrouter" as const,
				fallbackErrorCode: "provider_error",
				usedOpenRouterByokFallback: true,
			};
		}
	}
);
const hasToolCallMock = mock((_toolName: string) => () => false);
const stepCountIsMock = mock((_count: number) => () => false);
const getBehaviorSettingsMock = mock(() => ({
	maxToolInvocationsPerRun: 15,
	aiThinkingEnabled: false,
}));
const baseGuardResult = {
	allowed: true,
	mode: "normal" as const,
	reason: "Sufficient AI credits",
	blockedReason: null as string | null,
	minimumCharge: {
		baseCredits: 1,
		modelCredits: 0,
		thinkingCredits: 0,
		toolCredits: 0,
		totalCredits: 1,
		billableToolCount: 0,
		excludedToolCount: 0,
		totalToolCount: 0,
	},
	balance: 10,
	meterBacked: true,
	meterSource: "polar",
	lastSyncedAt: "2026-05-25T00:00:00.000Z",
};
const guardAiCreditRunMock = mock(async () => baseGuardResult);
const recordOpenRouterByokFailureMock = mock(async () => {});
const buildGenerationMessagesMock = mock(() => [
	{ role: "user" as const, content: "hello" },
]);
const logAiPipelineMock = mock(() => {});
const emitPipelineGenerationProgressMock = mock((async () => {}) as (
	...args: unknown[]
) => Promise<void>);
let mockSearchKnowledgeResult: unknown;

type MockAgentOptions = {
	model: string;
	instructions: string;
	tools: Record<string, { execute: (input: unknown) => Promise<unknown> }>;
	maxOutputTokens?: number;
	providerOptions?: unknown;
	prepareStep?: (params: {
		steps: Array<{ toolCalls?: Array<{ toolName?: string }> }>;
	}) => {
		system: string;
		activeTools?: string[];
	};
};

type MockAgentInput = {
	messages: Array<{ role: "user" | "assistant"; content: string }>;
	abortSignal?: AbortSignal;
};

const queuedGenerateHandlers: Array<
	(params: {
		options: MockAgentOptions;
		input: MockAgentInput;
	}) => Promise<unknown>
> = [];

class ToolLoopAgentMock {
	private readonly options: MockAgentOptions;

	constructor(options: MockAgentOptions) {
		this.options = options;
	}

	async generate(input: MockAgentInput): Promise<unknown> {
		const handler = queuedGenerateHandlers.shift();
		if (!handler) {
			throw new Error("No queued generate handler");
		}
		return handler({ options: this.options, input });
	}
}

const buildPipelineToolsetMock = mock(
	({
		context,
		allowedToolNames,
	}: {
		context: {
			allowPublicMessages: boolean;
			pipelineKind: "primary" | "background";
			runtimeState: {
				toolCallCounts: Record<string, number>;
				mutationToolCallCounts: Record<string, number>;
				publicMessagesSent: number;
				publicReplyTexts?: string[];
				publicSendSequence: number;
				toolExecutions: Array<{
					toolName: string;
					state: "result" | "error";
					input: Record<string, unknown>;
					output?: unknown;
					errorText?: string;
				}>;
				finalAction: {
					action: "respond" | "skip" | "escalate";
					reasoning: string;
					confidence: number;
				} | null;
			};
		};
		allowedToolNames?: string[];
	}) => {
		const increment = (toolName: string) => {
			context.runtimeState.toolCallCounts[toolName] =
				(context.runtimeState.toolCallCounts[toolName] ?? 0) + 1;
		};
		const incrementMutation = (toolName: string) => {
			context.runtimeState.mutationToolCallCounts[toolName] =
				(context.runtimeState.mutationToolCallCounts[toolName] ?? 0) + 1;
		};
		const recordResult = (
			toolName: string,
			input: Record<string, unknown>,
			output: unknown
		) => {
			context.runtimeState.toolExecutions.push({
				toolName,
				state: "result",
				input,
				output,
			});
		};

		const publicTools = {
			sendMessage: {
				description: "Chat message",
				execute: async (input: unknown) => {
					const parsed = input as { message: string };
					increment("sendMessage");
					context.runtimeState.publicSendSequence += 1;
					context.runtimeState.publicMessagesSent += 1;
					context.runtimeState.publicReplyTexts ??= [];
					context.runtimeState.publicReplyTexts.push(parsed.message);
					const output = {
						success: true,
						data: { messageId: `msg-${Date.now()}`, created: true },
					};
					recordResult("sendMessage", { message: parsed.message }, output);
					return output;
				},
			},
		};

		const publicFinishTools = {
			respond: {
				description: "Finish respond",
				execute: async (input: unknown) => {
					const parsed = input as { reasoning: string; confidence: number };
					increment("respond");
					context.runtimeState.finalAction = {
						action: "respond",
						reasoning: parsed.reasoning,
						confidence: parsed.confidence,
					};
					return { success: true };
				},
			},
			escalate: {
				description: "Finish escalate",
				execute: async (input: unknown) => {
					const parsed = input as {
						reason: string;
						visitorMessage: string;
						reasoning: string;
						confidence: number;
					};
					increment("escalate");
					incrementMutation("escalate");
					if (parsed.visitorMessage?.trim()) {
						context.runtimeState.publicSendSequence += 1;
						context.runtimeState.publicMessagesSent += 1;
						context.runtimeState.publicReplyTexts ??= [];
						context.runtimeState.publicReplyTexts.push(
							parsed.visitorMessage.trim()
						);
					}
					context.runtimeState.finalAction = {
						action: "escalate",
						reasoning: parsed.reasoning || parsed.reason,
						confidence: parsed.confidence,
					};
					return {
						success: true,
						data: { action: "escalate", changed: true },
					};
				},
			},
		};

		const backgroundTools = {
			updateSentiment: {
				description: "Update sentiment",
				execute: async () => {
					increment("updateSentiment");
					incrementMutation("updateSentiment");
					return {
						success: true,
						changed: true,
						data: { changed: true, sentiment: "positive" },
					};
				},
			},
			setPriority: {
				description: "Set priority",
				execute: async () => {
					increment("setPriority");
					incrementMutation("setPriority");
					return {
						success: true,
						changed: true,
						data: { changed: true, priority: "high" },
					};
				},
			},
		};

		const allTools = {
			...(context.pipelineKind === "background"
				? backgroundTools
				: {
						searchKnowledgeBase: {
							description: "Search KB",
							execute: async (input: unknown) => {
								const parsed = input as {
									query?: string;
									questionContext?: string;
								};
								increment("searchKnowledgeBase");
								recordResult(
									"searchKnowledgeBase",
									{
										query: parsed.query ?? "",
										...(parsed.questionContext
											? { questionContext: parsed.questionContext }
											: {}),
									},
									mockSearchKnowledgeResult
								);
								return mockSearchKnowledgeResult;
							},
						},
					}),
			...(context.allowPublicMessages ? publicTools : {}),
			...(context.allowPublicMessages ? publicFinishTools : {}),
			skip: {
				description: "Finish skip",
				execute: async (input: unknown) => {
					const parsed = input as { reasoning: string };
					increment("skip");
					context.runtimeState.finalAction = {
						action: "skip",
						reasoning: parsed.reasoning,
						confidence: 1,
					};
					return { success: true };
				},
			},
		};

		const filteredEntries = Object.entries(allTools).filter(([toolName]) =>
			allowedToolNames ? allowedToolNames.includes(toolName) : true
		);
		const tools = Object.fromEntries(filteredEntries);
		const toolNames = filteredEntries.map(([toolName]) => toolName);
		const finishToolNames = toolNames.filter((toolName) =>
			["respond", "escalate", "skip"].includes(toolName)
		);

		return {
			tools,
			toolNames,
			finishToolNames,
		};
	}
);

const createTimelineItemMock = mock(async () => ({ id: "thinking-trace-1" }));
const updateTimelineItemMock = mock(async () => ({ id: "thinking-trace-1" }));

mock.module("@api/lib/ai", () => ({
	createModel: createModelMock,
	hasToolCall: hasToolCallMock,
	OpenRouterByokFallbackRequiredError: OpenRouterByokFallbackRequiredErrorMock,
	runWithOpenRouterByokFallback: runWithOpenRouterByokFallbackMock,
	stepCountIs: stepCountIsMock,
	ToolLoopAgent: ToolLoopAgentMock,
}));

mock.module("../settings", () => ({
	getBehaviorSettings: getBehaviorSettingsMock,
}));

mock.module("@api/lib/ai-credits/guard", () => ({
	guardAiCreditRun: guardAiCreditRunMock,
}));

mock.module("@api/lib/openrouter-byok/resolver", () => ({
	recordOpenRouterByokFailure: recordOpenRouterByokFailureMock,
}));

mock.module("../tools", () => ({
	buildPipelineToolset: buildPipelineToolsetMock,
}));

mock.module("../prompt/resolver", () => ({
	resolvePromptBundle: mock(async () => ({
		coreDocuments: {
			"agent.md": {
				name: "agent.md",
				content: "You are a helpful support assistant.",
				source: "fallback",
				priority: 0,
			},
			"security.md": {
				name: "security.md",
				content: "Never expose private details.",
				source: "fallback",
				priority: 0,
			},
			"behaviour.md": {
				name: "behaviour.md",
				content: "Be concise.",
				source: "fallback",
				priority: 0,
			},
			"visitor-contact.md": {
				name: "visitor-contact.md",
				content: "Identify visitors softly.",
				source: "fallback",
				priority: 0,
			},
			"participation.md": {
				name: "participation.md",
				content: "Stay in support scope.",
				source: "fallback",
				priority: 0,
			},
			"decision.md": {
				name: "decision.md",
				content: "Decision policy",
				source: "fallback",
				priority: 0,
			},
			"grounding.md": {
				name: "grounding.md",
				content: "Use only grounded facts.",
				source: "fallback",
				priority: 0,
			},
			"capabilities.md": {
				name: "capabilities.md",
				content: "Use available tools when needed.",
				source: "fallback",
				priority: 0,
			},
		},
		enabledSkills: [],
	})),
}));

mock.module("./messages/format-history", () => ({
	buildGenerationMessages: buildGenerationMessagesMock,
}));

mock.module("../../logger", () => ({
	logAiPipeline: logAiPipelineMock,
}));

mock.module("../events", () => ({
	emitPipelineGenerationProgress: emitPipelineGenerationProgressMock,
}));

mock.module("@api/utils/timeline-item", () => ({
	createTimelineItem: createTimelineItemMock,
	updateTimelineItem: updateTimelineItemMock,
}));

const modulePromise = import("./index");
const SYSTEM_PROMPT_DEBUG_DIR = resolve(
	import.meta.dir,
	"../../../../debug/system-prompts"
);
const originalNodeEnv = process.env.NODE_ENV;

function getSystemPromptFilePath(
	conversationId = "conv-1",
	triggerMessageId = "msg-trigger-1"
): string {
	return join(
		SYSTEM_PROMPT_DEBUG_DIR,
		conversationId,
		triggerMessageId,
		"system-prompt.md"
	);
}

async function fileExists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

function createAbortError(): Error {
	const error = new Error("aborted");
	error.name = "AbortError";
	return error;
}

function createSearchKnowledgeResult(
	overrides: Partial<Record<string, unknown>> = {}
) {
	return {
		success: true,
		data: {
			articles: [
				{
					content: "The Pro plan starts at $29/month.",
					knowledgeId: "kb-1",
					similarity: 0.91,
					title: "Pricing",
					sourceUrl: "https://example.com/pricing",
					sourceType: "faq",
				},
			],
			query: "pricing",
			questionContext: "How much is the product?",
			totalFound: 1,
			maxSimilarity: 0.91,
			retrievalQuality: "strong",
			clarificationSignal: "none",
			lowConfidence: false,
			guidance:
				"Strong knowledge match found. Answer directly from the retrieved snippets first.",
			...overrides,
		},
	};
}

function createInput(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		db: {} as never,
		pipelineKind: "primary" as const,
		mode: "respond_to_visitor" as const,
		aiAgent: {
			id: "ai-1",
			name: "Agent",
			model: "moonshotai/kimi-k2.5",
			basePrompt: "You are a helpful support assistant.",
			behaviorSettings: {},
		} as never,
		conversation: {
			id: "conv-1",
			organizationId: "org-1",
			websiteId: "site-1",
			visitorId: "visitor-1",
		} as never,
		generationEntries: [],
		visitorContext: null,
		conversationState: {
			hasHumanAssignee: false,
			assigneeIds: [],
			participantIds: [],
			isEscalated: false,
			escalationReason: null,
		},
		humanCommand: null,
		workflowRunId: "wf-1",
		triggerMessageId: "msg-trigger-1",
		hasLaterHumanMessage: false,
		hasLaterAiMessage: false,
		allowPublicMessages: true,
		...overrides,
	};
}

describe("runGenerationRuntime", () => {
	beforeEach(() => {
		queuedGenerateHandlers.length = 0;
		mockOpenRouterBillingSource = "cossistant";
		mockOpenRouterFallbackAfterError = false;
		process.env.NODE_ENV = "test";
		mockSearchKnowledgeResult = createSearchKnowledgeResult();
		createModelMock.mockClear();
		runWithOpenRouterByokFallbackMock.mockClear();
		hasToolCallMock.mockClear();
		stepCountIsMock.mockClear();
		getBehaviorSettingsMock.mockClear();
		getBehaviorSettingsMock.mockReturnValue({
			maxToolInvocationsPerRun: 15,
			aiThinkingEnabled: false,
		});
		guardAiCreditRunMock.mockClear();
		guardAiCreditRunMock.mockResolvedValue(baseGuardResult);
		recordOpenRouterByokFailureMock.mockClear();
		buildGenerationMessagesMock.mockClear();
		buildPipelineToolsetMock.mockClear();
		logAiPipelineMock.mockClear();
		emitPipelineGenerationProgressMock.mockClear();
		createTimelineItemMock.mockClear();
		updateTimelineItemMock.mockClear();
	});

	afterEach(async () => {
		process.env.NODE_ENV = originalNodeEnv;
		await rm(SYSTEM_PROMPT_DEBUG_DIR, { recursive: true, force: true });
	});

	it("writes the exact final system prompt to the non-production debug path", async () => {
		let capturedSystemPrompt = "";
		let capturedMessages: MockAgentInput["messages"] = [];
		queuedGenerateHandlers.push(async ({ options, input }) => {
			capturedSystemPrompt = options.instructions;
			capturedMessages = input.messages;
			await options.tools.skip.execute({ reasoning: "Nothing to do" });
			return { usage: {} };
		});

		const { runGenerationRuntime } = await modulePromise;
		const result = await runGenerationRuntime(createInput() as never);
		const fileContents = await readFile(getSystemPromptFilePath(), "utf8");

		expect(result.status).toBe("completed");
		expect(capturedSystemPrompt.length).toBeGreaterThan(0);
		expect(capturedMessages).toEqual([{ role: "user", content: "hello" }]);
		expect(fileContents).toBe(`## Messages Sent To Model
\`\`\`json
${JSON.stringify(capturedMessages, null, 2)}
\`\`\`

## System Prompt
${capturedSystemPrompt}`);
	});

	it("does not write a system prompt dump in production", async () => {
		process.env.NODE_ENV = "production";
		queuedGenerateHandlers.push(async ({ options }) => {
			await options.tools.skip.execute({ reasoning: "Nothing to do" });
			return { usage: {} };
		});

		const { runGenerationRuntime } = await modulePromise;
		const result = await runGenerationRuntime(createInput() as never);

		expect(result.status).toBe("completed");
		expect(await fileExists(getSystemPromptFilePath())).toBe(false);
	});

	it("overwrites the existing system prompt dump for the same trigger", async () => {
		const { runGenerationRuntime } = await modulePromise;
		let firstPrompt = "";
		let secondPrompt = "";
		let secondMessages: MockAgentInput["messages"] = [];

		queuedGenerateHandlers.push(async ({ options }) => {
			firstPrompt = options.instructions;
			await options.tools.skip.execute({ reasoning: "Nothing to do" });
			return { usage: {} };
		});
		await runGenerationRuntime(createInput() as never);

		queuedGenerateHandlers.push(async ({ options, input }) => {
			secondPrompt = options.instructions;
			secondMessages = input.messages;
			await options.tools.skip.execute({ reasoning: "Nothing to do" });
			return { usage: {} };
		});
		await runGenerationRuntime(
			createInput({
				humanCommand: "Please provide the updated next steps.",
			}) as never
		);

		expect(firstPrompt).not.toBe(secondPrompt);
		expect(
			await readFile(getSystemPromptFilePath(), "utf8")
		).toBe(`## Messages Sent To Model
\`\`\`json
${JSON.stringify(secondMessages, null, 2)}
\`\`\`

## System Prompt
${secondPrompt}`);
	});

	it("swallows debug dump write failures without changing generation results", async () => {
		const originalWarn = console.warn;
		const consoleWarnMock = mock((..._args: unknown[]) => {});
		console.warn = consoleWarnMock as typeof console.warn;

		await mkdir(join(SYSTEM_PROMPT_DEBUG_DIR, "conv-1"), {
			recursive: true,
		});
		await writeFile(
			join(SYSTEM_PROMPT_DEBUG_DIR, "conv-1", "msg-trigger-1"),
			"blocking file",
			"utf8"
		);
		queuedGenerateHandlers.push(async ({ options }) => {
			await options.tools.skip.execute({ reasoning: "Nothing to do" });
			return { usage: {} };
		});

		try {
			const { runGenerationRuntime } = await modulePromise;
			const result = await runGenerationRuntime(createInput() as never);

			expect(result.status).toBe("completed");
			expect(
				consoleWarnMock.mock.calls.some(
					(call) =>
						typeof call[0] === "string" &&
						call[0].includes("evt=system_prompt_dump_failed")
				)
			).toBe(true);
		} finally {
			console.warn = originalWarn;
		}
	});

	it("returns runtime error on provider AbortError before any public message without customer BYOK", async () => {
		queuedGenerateHandlers.push(async () => {
			throw createAbortError();
		});

		const { runGenerationRuntime } = await modulePromise;
		const result = await runGenerationRuntime(createInput() as never);

		expect(result.status).toBe("error");
		expect(result.failureCode).toBe("runtime_error");
		expect(result.publicMessagesSent).toBe(0);
		expect(result.attempts).toHaveLength(1);
		expect(result.attempts?.[0]).toMatchObject({
			modelId: "moonshotai/kimi-k2.5",
			attempt: 1,
			outcome: "error",
		});
		expect(createModelMock.mock.calls.map((call) => call[0])).toEqual([
			"moonshotai/kimi-k2.5",
		]);
	});

	it("does not schedule BYOK retry when provider AbortError happens after a public message", async () => {
		queuedGenerateHandlers.push(async ({ options }) => {
			await options.tools.sendMessage.execute({ message: "First message" });
			throw createAbortError();
		});

		const { runGenerationRuntime } = await modulePromise;
		const result = await runGenerationRuntime(createInput() as never);

		expect(result.status).toBe("error");
		expect(result.action.action).toBe("skip");
		expect(result.failureCode).toBe("runtime_error");
		expect(result.publicMessagesSent).toBe(1);
		expect(result.attempts).toHaveLength(1);
		expect(createModelMock).toHaveBeenCalledTimes(1);
	});

	it("returns missing_finish_action error when no finish tool is called", async () => {
		queuedGenerateHandlers.push(async () => ({ usage: {} }));

		const { runGenerationRuntime } = await modulePromise;
		const result = await runGenerationRuntime(createInput() as never);

		expect(result.status).toBe("error");
		expect(result.failureCode).toBe("missing_finish_action");
		expect(result.publicMessagesSent).toBe(0);
		expect(result.attempts).toHaveLength(1);
		expect(result.attempts?.[0]?.outcome).toBe("error");
	});

	it("keeps explicit skip as a valid completed silent outcome", async () => {
		queuedGenerateHandlers.push(async ({ options }) => {
			await options.tools.skip.execute({ reasoning: "Nothing to do" });
			return { usage: {} };
		});

		const { runGenerationRuntime } = await modulePromise;
		const result = await runGenerationRuntime(createInput() as never);

		expect(result.status).toBe("completed");
		expect(result.action.action).toBe("skip");
		expect(result.failureCode).toBeUndefined();
		expect(result.attempts).toHaveLength(1);
		expect(result.attempts?.[0]?.outcome).toBe("completed");
	});

	it("passes the agent max output token setting to ToolLoopAgent", async () => {
		let capturedMaxOutputTokens: number | undefined;
		queuedGenerateHandlers.push(async ({ options }) => {
			capturedMaxOutputTokens = options.maxOutputTokens;
			await options.tools.skip.execute({ reasoning: "Nothing to do" });
			return { usage: {} };
		});

		const { runGenerationRuntime } = await modulePromise;
		const result = await runGenerationRuntime(
			createInput({
				aiAgent: {
					id: "ai-1",
					name: "Agent",
					model: "moonshotai/kimi-k2.5",
					basePrompt: "You are a helpful support assistant.",
					maxOutputTokens: 777,
					behaviorSettings: {},
				},
			}) as never
		);

		expect(result.status).toBe("completed");
		expect(capturedMaxOutputTokens).toBe(777);
	});

	it("passes OpenRouter reasoning options and logs a private thinking trace when supported thinking is enabled", async () => {
		getBehaviorSettingsMock.mockReturnValue({
			maxToolInvocationsPerRun: 15,
			aiThinkingEnabled: true,
		});
		let capturedProviderOptions: unknown;
		queuedGenerateHandlers.push(async ({ options }) => {
			capturedProviderOptions = options.providerOptions;
			await options.tools.skip.execute({ reasoning: "Nothing to do" });
			return {
				reasoningText: "Checked the retrieved evidence before answering.",
				usage: {
					inputTokens: 100,
					outputTokens: 40,
					totalTokens: 140,
					outputTokenDetails: {
						reasoningTokens: 12,
					},
				},
			};
		});

		const { runGenerationRuntime } = await modulePromise;
		const result = await runGenerationRuntime(
			createInput({
				aiAgent: {
					id: "ai-1",
					name: "Agent",
					model: "openai/gpt-5.5",
					basePrompt: "You are a helpful support assistant.",
					maxOutputTokens: 1024,
					behaviorSettings: { aiThinkingEnabled: true },
				},
			}) as never
		);

		expect(result.status).toBe("completed");
		expect(capturedProviderOptions).toEqual({
			openrouter: {
				reasoning: {
					max_tokens: 512,
					exclude: false,
				},
			},
		});
		expect(result.usage?.reasoningTokens).toBe(12);
		expect(result.thinking).toMatchObject({
			requested: true,
			enabled: true,
			supported: true,
			thinkingCredits: 3,
			captureStatus: "captured",
		});
		expect(createTimelineItemMock).toHaveBeenCalledTimes(1);
		const thinkingTraceCalls = createTimelineItemMock.mock.calls as unknown as [
			Record<string, unknown>,
		][];
		const thinkingTraceCall = thinkingTraceCalls[0]?.[0];
		expect(thinkingTraceCall).toMatchObject({
			item: {
				tool: "aiThinkingTrace",
				visibility: "private",
				parts: [
					{
						toolName: "aiThinkingTrace",
						output: {
							captureStatus: "captured",
							tokens: {
								reasoningTokens: 12,
							},
						},
					},
					{
						type: "reasoning",
						text: "Checked the retrieved evidence before answering.",
					},
				],
			},
		});
	});

	it("does not pass reasoning options when thinking is requested for an unsupported model", async () => {
		getBehaviorSettingsMock.mockReturnValue({
			maxToolInvocationsPerRun: 15,
			aiThinkingEnabled: true,
		});
		let capturedProviderOptions: unknown = "unset";
		queuedGenerateHandlers.push(async ({ options }) => {
			capturedProviderOptions = options.providerOptions;
			await options.tools.skip.execute({ reasoning: "Nothing to do" });
			return { usage: {} };
		});

		const { runGenerationRuntime } = await modulePromise;
		const result = await runGenerationRuntime(
			createInput({
				aiAgent: {
					id: "ai-1",
					name: "Agent",
					model: "openai/gpt-5.2-chat",
					basePrompt: "You are a helpful support assistant.",
					behaviorSettings: { aiThinkingEnabled: true },
				},
			}) as never
		);

		expect(result.status).toBe("completed");
		expect(capturedProviderOptions).toBeUndefined();
		expect(createTimelineItemMock).not.toHaveBeenCalled();
		expect(result.thinking).toMatchObject({
			requested: true,
			enabled: false,
			supported: false,
			thinkingCredits: 0,
			captureStatus: "not_requested",
		});
	});

	it("does not run the Cossistant credit guard for customer OpenRouter BYOK", async () => {
		mockOpenRouterBillingSource = "customer_openrouter";
		queuedGenerateHandlers.push(async ({ options }) => {
			await options.tools.skip.execute({ reasoning: "Nothing to do" });
			return { usage: {} };
		});

		const { runGenerationRuntime } = await modulePromise;
		const result = await runGenerationRuntime(createInput() as never);

		expect(result.status).toBe("completed");
		expect(result.billingSource).toBe("customer_openrouter");
		expect(guardAiCreditRunMock).not.toHaveBeenCalled();
	});

	it("returns BYOK retry metadata after the first customer-key provider failure", async () => {
		mockOpenRouterBillingSource = "customer_openrouter";
		queuedGenerateHandlers.push(async () => {
			throw new Error("customer key failed");
		});

		const { runGenerationRuntime } = await modulePromise;
		const result = await runGenerationRuntime(createInput() as never);

		expect(result.status).toBe("error");
		expect(result.failureCode).toBe("openrouter_byok_retry_required");
		expect(result.openRouterByokRetry).toMatchObject({
			mode: "customer",
			customerFailureCount: 1,
			lastErrorCode: "provider_error",
		});
		expect(result.openRouterByokFailure).toMatchObject({
			errorCode: "provider_error",
			billingSource: "customer_openrouter",
			fallbackEligible: true,
			localAbort: false,
		});
		expect(guardAiCreditRunMock).not.toHaveBeenCalled();
		expect(recordOpenRouterByokFailureMock).not.toHaveBeenCalled();
	});

	it("treats provider AbortError as BYOK retryable when the local signal did not abort", async () => {
		mockOpenRouterBillingSource = "customer_openrouter";
		queuedGenerateHandlers.push(async () => {
			throw createAbortError();
		});

		const { runGenerationRuntime } = await modulePromise;
		const result = await runGenerationRuntime(createInput() as never);

		expect(result.status).toBe("error");
		expect(result.failureCode).toBe("openrouter_byok_retry_required");
		expect(result.openRouterByokRetry).toMatchObject({
			mode: "customer",
			customerFailureCount: 1,
			lastErrorCode: "AbortError",
		});
		expect(result.openRouterByokFailure).toMatchObject({
			errorCode: "AbortError",
			localAbort: false,
		});
	});

	it("records the exhausted customer-key failure before scheduling Cossistant fallback", async () => {
		mockOpenRouterBillingSource = "customer_openrouter";
		queuedGenerateHandlers.push(async () => {
			throw new Error("customer key failed");
		});

		const { runGenerationRuntime } = await modulePromise;
		const result = await runGenerationRuntime(
			createInput({
				openRouterByokRetry: {
					mode: "customer",
					customerFailureCount: 1,
					lastErrorCode: "provider_error",
					lastFailedAt: "2026-05-26T10:00:00.000Z",
				},
			}) as never
		);

		expect(result.status).toBe("error");
		expect(result.failureCode).toBe("openrouter_byok_retry_required");
		expect(result.openRouterByokRetry).toMatchObject({
			mode: "cossistant",
			customerFailureCount: 2,
			lastErrorCode: "provider_error",
		});
		expect(recordOpenRouterByokFailureMock).toHaveBeenCalledWith(
			expect.objectContaining({
				billingSource: "customer_openrouter",
				errorCode: "provider_error",
				sendAlert: true,
				pauseFallback: true,
			})
		);
		expect(guardAiCreditRunMock).not.toHaveBeenCalled();
	});

	it("uses platform-covered Cossistant fallback without the customer credit guard", async () => {
		queuedGenerateHandlers.push(async ({ options }) => {
			await options.tools.skip.execute({ reasoning: "Fallback answered" });
			return { usage: {} };
		});

		const { runGenerationRuntime } = await modulePromise;
		const result = await runGenerationRuntime(
			createInput({
				openRouterByokRetry: {
					mode: "cossistant",
					customerFailureCount: 2,
					lastErrorCode: "provider_error",
					lastFailedAt: "2026-05-26T10:00:00.000Z",
				},
			}) as never
		);

		expect(result.status).toBe("completed");
		expect(result.billingSource).toBe("cossistant_platform");
		expect(guardAiCreditRunMock).not.toHaveBeenCalled();
	});

	it("does not pass reasoning options or create a second trace on repair attempts", async () => {
		getBehaviorSettingsMock.mockReturnValue({
			maxToolInvocationsPerRun: 15,
			aiThinkingEnabled: true,
		});
		const providerOptions: unknown[] = [];
		queuedGenerateHandlers.push(async ({ options }) => {
			providerOptions.push(options.providerOptions);
			await options.tools.respond.execute({
				reasoning: "No public reply sent",
				confidence: 1,
			});
			return {
				reasoningText: "Reasoned before the first attempt.",
				usage: {
					inputTokens: 100,
					outputTokens: 40,
					totalTokens: 140,
					outputTokenDetails: { reasoningTokens: 12 },
				},
			};
		});
		queuedGenerateHandlers.push(async ({ options }) => {
			providerOptions.push(options.providerOptions);
			await options.tools.sendMessage.execute({
				message: "Here's the reply the visitor should have received.",
			});
			await options.tools.respond.execute({
				reasoning: "Repaired missing public reply",
				confidence: 1,
			});
			return { usage: {} };
		});

		const { runGenerationRuntime } = await modulePromise;
		const result = await runGenerationRuntime(
			createInput({
				aiAgent: {
					id: "ai-1",
					name: "Agent",
					model: "openai/gpt-5.5",
					basePrompt: "You are a helpful support assistant.",
					behaviorSettings: { aiThinkingEnabled: true },
				},
			}) as never
		);

		expect(result.status).toBe("completed");
		expect(result.attempts).toHaveLength(2);
		expect(providerOptions[0]).toEqual({
			openrouter: {
				reasoning: {
					max_tokens: 512,
					exclude: false,
				},
			},
		});
		expect(providerOptions[1]).toBeUndefined();
		expect(createTimelineItemMock).toHaveBeenCalledTimes(1);
	});

	it("redacts and truncates thinking trace reasoning text", async () => {
		const { sanitizeReasoningText } = await import("./internal/thinking-trace");
		const sanitized = sanitizeReasoningText(
			`Bearer abc.def.ghi sk-testsecret123456 password=supersecret ${"x".repeat(
				5000
			)}`
		);

		expect(sanitized).not.toContain("abc.def.ghi");
		expect(sanitized).not.toContain("sk-testsecret123456");
		expect(sanitized).not.toContain("supersecret");
		expect(sanitized).toContain("Bearer [redacted]");
		expect(sanitized).toContain("sk-[redacted]");
		expect(sanitized).toContain("password: [redacted]");
		expect(sanitized?.endsWith("... [truncated]")).toBe(true);
		expect(sanitized?.length).toBeLessThanOrEqual(4016);
	});

	it("repairs visitor-facing completion when main sendMessage was not called", async () => {
		queuedGenerateHandlers.push(async ({ options }) => {
			await options.tools.respond.execute({
				reasoning: "No public reply sent",
				confidence: 1,
			});
			return { usage: {} };
		});
		queuedGenerateHandlers.push(async ({ options }) => {
			expect(options.instructions).toContain("## Answer-First Repair");
			expect(options.tools.searchKnowledgeBase).toBeUndefined();
			await options.tools.sendMessage.execute({
				message: "Here's the grounded reply the visitor should have received.",
			});
			await options.tools.respond.execute({
				reasoning: "Repaired missing public reply",
				confidence: 1,
			});
			return { usage: {} };
		});

		const { runGenerationRuntime } = await modulePromise;
		const result = await runGenerationRuntime(createInput() as never);

		expect(result.status).toBe("completed");
		expect(result.action.action).toBe("respond");
		expect(result.publicMessagesSent).toBe(1);
		expect(result.attempts).toHaveLength(2);
		expect(buildPipelineToolsetMock.mock.calls[1]?.[0]).toMatchObject({
			allowedToolNames: ["sendMessage", "respond", "escalate"],
		});
	});

	it("fails command completion when main sendMessage was not called", async () => {
		queuedGenerateHandlers.push(async ({ options }) => {
			await options.tools.respond.execute({
				reasoning: "Handled command without public reply",
				confidence: 1,
			});
			return { usage: {} };
		});

		const { runGenerationRuntime } = await modulePromise;
		const result = await runGenerationRuntime(
			createInput({
				mode: "respond_to_command",
				humanCommand: "Please reply to the visitor",
			}) as never
		);

		expect(result.status).toBe("error");
		expect(result.failureCode).toBe("runtime_error");
		expect(result.error).toContain("requires sendMessage");
	});

	it("completes escalation with a model-provided visitor handoff", async () => {
		queuedGenerateHandlers.push(async ({ options }) => {
			await options.tools.escalate.execute({
				reason: "Visitor requested a human",
				visitorMessage:
					"I'll bring a teammate into the conversation so they can help from here.",
				reasoning: "Human help requested",
				confidence: 1,
			});
			return { usage: {} };
		});

		const { runGenerationRuntime } = await modulePromise;
		const result = await runGenerationRuntime(createInput() as never);

		expect(result.status).toBe("completed");
		expect(result.action.action).toBe("escalate");
		expect(result.failureCode).toBeUndefined();
		expect(result.publicMessagesSent).toBe(1);
	});

	it("repairs a strong KB clarification-only reply into an answer-first reply", async () => {
		queuedGenerateHandlers.push(async ({ options }) => {
			await options.tools.searchKnowledgeBase.execute({
				query: "pricing",
				questionContext: "How much is the product?",
			});
			await options.tools.sendMessage.execute({
				message: "Which plan are you asking about?",
			});
			await options.tools.respond.execute({
				reasoning: "Asked only for clarification",
				confidence: 1,
			});
			return { usage: {} };
		});
		queuedGenerateHandlers.push(async ({ options }) => {
			expect(options.instructions).toContain("## Earlier KB Evidence");
			expect(options.tools.searchKnowledgeBase).toBeUndefined();
			await options.tools.sendMessage.execute({
				message:
					"The Pro plan starts at $29/month. Which team size are you pricing out?",
			});
			await options.tools.respond.execute({
				reasoning: "Shared the grounded answer before clarifying",
				confidence: 1,
			});
			return { usage: {} };
		});

		const { runGenerationRuntime } = await modulePromise;
		const result = await runGenerationRuntime(createInput() as never);

		expect(result.status).toBe("completed");
		expect(result.action.action).toBe("respond");
		expect(result.publicMessagesSent).toBe(2);
		expect(result.attempts).toHaveLength(2);
	});

	it("repairs a strong KB skip into a grounded public answer", async () => {
		queuedGenerateHandlers.push(async ({ options }) => {
			await options.tools.searchKnowledgeBase.execute({
				query: "pricing",
				questionContext: "How much is the product?",
			});
			await options.tools.skip.execute({
				reasoning: "Nothing left to say",
			});
			return { usage: {} };
		});
		queuedGenerateHandlers.push(async ({ options }) => {
			expect(options.instructions).toContain(
				"KB search found actionable evidence"
			);
			await options.tools.sendMessage.execute({
				message: "The Pro plan starts at $29/month.",
			});
			await options.tools.respond.execute({
				reasoning: "Converted skip into an answer",
				confidence: 1,
			});
			return { usage: {} };
		});

		const { runGenerationRuntime } = await modulePromise;
		const result = await runGenerationRuntime(createInput() as never);

		expect(result.status).toBe("completed");
		expect(result.action.action).toBe("respond");
		expect(result.attempts).toHaveLength(2);
	});

	it("accepts a weak KB partial answer plus a narrow follow-up without repair", async () => {
		mockSearchKnowledgeResult = createSearchKnowledgeResult({
			articles: [
				{
					content: "The Pro plan starts at $29/month.",
					knowledgeId: "kb-1",
					similarity: 0.62,
					title: "Pricing",
					sourceUrl: "https://example.com/pricing",
					sourceType: "faq",
				},
			],
			maxSimilarity: 0.62,
			retrievalQuality: "weak",
			clarificationSignal: "background_review",
			lowConfidence: true,
		});

		queuedGenerateHandlers.push(async ({ options }) => {
			await options.tools.searchKnowledgeBase.execute({
				query: "pricing",
				questionContext: "How much is the product?",
			});
			await options.tools.sendMessage.execute({
				message:
					"I found pricing for the Pro plan, but not the yearly rate. Are you asking about monthly or annual billing?",
			});
			await options.tools.respond.execute({
				reasoning: "Shared the partial answer and asked one narrow follow-up",
				confidence: 1,
			});
			return { usage: {} };
		});

		const { runGenerationRuntime } = await modulePromise;
		const result = await runGenerationRuntime(createInput() as never);

		expect(result.status).toBe("completed");
		expect(result.action.action).toBe("respond");
		expect(result.attempts).toHaveLength(1);
	});

	it("accepts a none-hit escalation after explaining the gap", async () => {
		mockSearchKnowledgeResult = createSearchKnowledgeResult({
			articles: [],
			totalFound: 0,
			maxSimilarity: null,
			retrievalQuality: "none",
			clarificationSignal: "immediate",
			guidance:
				"No relevant knowledge found. Tell the visitor you could not confirm it from the knowledge base and offer escalation.",
		});

		queuedGenerateHandlers.push(async ({ options }) => {
			await options.tools.searchKnowledgeBase.execute({
				query: "pricing",
				questionContext: "How much is the product?",
			});
			await options.tools.escalate.execute({
				reason: "Need human confirmation",
				visitorMessage:
					"I couldn't confirm that from the current knowledge base, so I'm looping in a teammate.",
				reasoning: "Escalated after explaining the KB gap",
				confidence: 1,
			});
			return { usage: {} };
		});

		const { runGenerationRuntime } = await modulePromise;
		const result = await runGenerationRuntime(createInput() as never);

		expect(result.status).toBe("completed");
		expect(result.action.action).toBe("escalate");
		expect(result.publicMessagesSent).toBe(1);
		expect(result.attempts).toHaveLength(1);
	});

	it("allows multiple sendMessage calls in one run", async () => {
		queuedGenerateHandlers.push(async ({ options }) => {
			await options.tools.sendMessage.execute({
				message: "First bubble.",
			});
			await options.tools.sendMessage.execute({
				message: "Second bubble.",
			});
			await options.tools.sendMessage.execute({
				message: "Third bubble.",
			});
			await options.tools.respond.execute({
				reasoning: "Answered in short bubbles",
				confidence: 1,
			});
			return { usage: {} };
		});

		const { runGenerationRuntime } = await modulePromise;
		const result = await runGenerationRuntime(createInput() as never);

		expect(result.status).toBe("completed");
		expect(result.action.action).toBe("respond");
		expect(result.publicMessagesSent).toBe(3);
	});

	it("keeps background_only silent", async () => {
		queuedGenerateHandlers.push(async ({ options }) => {
			await options.tools.skip.execute({ reasoning: "Background run" });
			return { usage: {} };
		});

		const { runGenerationRuntime } = await modulePromise;
		const result = await runGenerationRuntime(
			createInput({
				mode: "background_only",
				allowPublicMessages: false,
			}) as never
		);

		expect(result.status).toBe("completed");
		expect(result.action.action).toBe("skip");
		expect(result.publicMessagesSent).toBe(0);
	});

	it("removes already-used background one-shot tools from later steps", async () => {
		const activeToolSnapshots: Array<string[] | undefined> = [];
		queuedGenerateHandlers.push(async ({ options }) => {
			activeToolSnapshots.push(
				options.prepareStep?.({
					steps: [],
				})?.activeTools
			);
			activeToolSnapshots.push(
				options.prepareStep?.({
					steps: [
						{
							toolCalls: [{ toolName: "updateSentiment" }],
						},
					],
				})?.activeTools
			);
			activeToolSnapshots.push(
				options.prepareStep?.({
					steps: [
						{
							toolCalls: [{ toolName: "updateSentiment" }],
						},
						{
							toolCalls: [{ toolName: "setPriority" }],
						},
					],
				})?.activeTools
			);
			await options.tools.skip.execute({ reasoning: "Nothing left to do" });
			return { usage: {} };
		});

		const { runGenerationRuntime } = await modulePromise;
		const result = await runGenerationRuntime(
			createInput({
				pipelineKind: "background",
				mode: "background_only",
				allowPublicMessages: false,
			}) as never
		);

		expect(result.status).toBe("completed");
		expect(activeToolSnapshots).toEqual([
			["updateSentiment", "setPriority", "skip"],
			["setPriority", "skip"],
			["skip"],
		]);
	});
});
