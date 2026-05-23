import { beforeEach, describe, expect, it, mock } from "bun:test";

const logAiPipelineMock = mock((_params: unknown) => {});
const getAiAgentByIdMock = mock(async () => ({
	id: "ai-1",
	name: "Agent",
	model: "moonshotai/kimi-k2.5",
	basePrompt: "Help the visitor.",
	isActive: true,
	behaviorSettings: {},
}));
const getBehaviorSettingsMock = mock(() => ({
	autoGenerateTitle: true,
	autoAnalyzeSentiment: true,
	canSetPriority: true,
	autoCategorize: false,
	canCategorize: false,
	canRequestKnowledgeClarification: true,
}));
const listActiveWebsiteViewsMock = mock(
	(async (): Promise<
		Array<{
			id: string;
			name: string;
			description: string | null;
			prompt: string | null;
		}>
	> => []) as (...args: unknown[]) => Promise<
		Array<{
			id: string;
			name: string;
			description: string | null;
			prompt: string | null;
		}>
	>
);
const resolveAndPersistModelMock = mock(
	async ({ aiAgent }: { aiAgent: any }) => ({
		aiAgent,
		modelResolution: {
			modelIdResolved: aiAgent.model,
			modelIdOriginal: aiAgent.model,
			modelMigrationApplied: false,
		},
	})
);
const loadConversationSeedMock = mock(async () => ({
	conversation: {
		id: "conv-1",
		organizationId: "org-1",
		websiteId: "site-1",
		visitorId: "visitor-1",
		title: null as string | null,
		titleSource: null as "ai" | "user" | null,
		visitorTitle: null as string | null,
		visitorTitleLanguage: null as string | null,
	},
	triggerMetadata: {
		id: "msg-1",
		createdAt: "2026-03-04T10:00:00.000Z",
		conversationId: "conv-1",
	},
}));
const loadIntakeContextMock = mock(async () => ({
	websiteDefaultLanguage: "en",
	visitorLanguage: "es",
	autoTranslateEnabled: true,
	conversationHistory: [],
	decisionMessages: [],
	generationEntries: [],
	visitorContext: null,
	conversationState: {
		hasHumanAssignee: false,
		assigneeIds: [],
		participantIds: [],
		isEscalated: false,
		escalationReason: null,
	},
	triggerMessage: {
		messageId: "msg-1",
		content: "Please help",
		senderType: "visitor",
		senderId: null,
		senderName: null,
		timestamp: "2026-03-04T10:00:00.000Z",
		visibility: "public",
	},
	hasLaterHumanMessage: false,
	hasLaterAiMessage: false,
}));
const emitPipelineProcessingCompletedMock = mock(async () => {});
const emitPipelineSeenMock = mock(async () => {});
const emitPipelineGenerationProgressMock = mock(async () => {});
const emitPipelineToolProgressMock = mock(async () => {});
const emitPipelineTypingStartMock = mock(async () => {});
const emitPipelineTypingStopMock = mock(async () => {});
class PipelineTypingHeartbeatMock {
	running = false;
	async start() {}
	async stop() {}
}
const runGenerationRuntimeMock = mock((async () => ({
	status: "completed" as const,
	action: {
		action: "skip" as const,
		reasoning: "Updated sentiment",
		confidence: 1,
	},
	publicMessagesSent: 0,
	toolCallsByName: {
		updateSentiment: 1,
		skip: 1,
	},
	mutationToolCallsByName: {
		updateSentiment: 1,
	},
	totalToolCalls: 2,
})) as (...args: unknown[]) => Promise<any>);
const runBackgroundKnowledgeGapReviewMock = mock((async () => ({
	status: "skipped" as const,
	reason: "no_candidate_gap" as const,
})) as (...args: unknown[]) => Promise<any>);
const createModelMock = mock((modelId: string) => modelId);
const runWithOpenRouterByokFallbackMock = mock(
	async (params: {
		modelId: string;
		operation: (resolution: {
			model: string;
			billingSource: "cossistant";
		}) => Promise<unknown>;
	}) => ({
		result: await params.operation({
			model: createModelMock(params.modelId),
			billingSource: "cossistant" as const,
		}),
		billingSource: "cossistant" as const,
	})
);
const generateTextMock = mock((async () => ({
	output: {
		title: "Visitor asked for help",
		confidence: 0.9,
		reason: "Fallback title for a generic help request.",
	},
})) as (...args: unknown[]) => Promise<any>);
const resolveModelForExecutionMock = mock((modelId: string) => ({
	modelIdResolved: modelId,
}));
const loadCurrentConversationMock = mock(async () => ({
	id: "conv-1",
	visitorId: "visitor-1",
	title: null as string | null,
	titleSource: null as "ai" | "user" | null,
	visitorLanguage: "es",
}));
const realtimeEmitMock = mock(async () => {});
const createTimelineItemMock = mock(async () => {});
const syncConversationVisitorTitleMock = mock(async () => ({
	visitorTitle: null,
	visitorTitleLanguage: null,
}));

mock.module("../logger", () => ({
	logAiPipeline: logAiPipelineMock,
}));

mock.module("@api/db/queries/ai-agent", () => ({
	getAiAgentById: getAiAgentByIdMock,
}));

mock.module("@api/db/queries/view", () => ({
	listActiveWebsiteViews: listActiveWebsiteViewsMock,
}));

mock.module("@api/ai-pipeline/shared/settings", () => ({
	getBehaviorSettings: getBehaviorSettingsMock,
}));

mock.module("../primary-pipeline/steps/intake/model-resolution", () => ({
	resolveAndPersistModel: resolveAndPersistModelMock,
}));

mock.module("../primary-pipeline/steps/intake/load-context", () => ({
	loadConversationSeed: loadConversationSeedMock,
	loadIntakeContext: loadIntakeContextMock,
}));

mock.module("../shared/generation", () => ({
	runGenerationRuntime: runGenerationRuntimeMock,
}));

mock.module("./knowledge-gap-review", () => ({
	runBackgroundKnowledgeGapReview: runBackgroundKnowledgeGapReviewMock,
}));

mock.module("@api/lib/ai", () => ({
	createModel: createModelMock,
	generateText: generateTextMock,
	runWithOpenRouterByokFallback: runWithOpenRouterByokFallbackMock,
	Output: {
		object: (params: unknown) => params,
	},
}));

mock.module("@api/lib/ai-credits/config", () => ({
	resolveModelForExecution: resolveModelForExecutionMock,
}));

mock.module("../shared/actions/load-current-conversation", () => ({
	loadCurrentConversation: loadCurrentConversationMock,
}));

mock.module("@api/realtime/emitter", () => ({
	realtime: {
		emit: realtimeEmitMock,
	},
}));

mock.module("@api/utils/timeline-item", () => ({
	createTimelineItem: createTimelineItemMock,
}));

mock.module("@api/lib/translation", () => ({
	syncConversationVisitorTitle: syncConversationVisitorTitleMock,
}));

mock.module("../shared/events", () => ({
	emitPipelineProcessingCompleted: emitPipelineProcessingCompletedMock,
	emitPipelineProcessingCompletedSafely: emitPipelineProcessingCompletedMock,
	emitPipelineSeen: emitPipelineSeenMock,
	emitPipelineGenerationProgress: emitPipelineGenerationProgressMock,
	emitPipelineToolProgress: emitPipelineToolProgressMock,
	emitPipelineTypingStart: emitPipelineTypingStartMock,
	emitPipelineTypingStop: emitPipelineTypingStopMock,
	PipelineTypingHeartbeat: PipelineTypingHeartbeatMock,
}));

const modulePromise = import("./index");

const baseInput = {
	conversationId: "conv-1",
	websiteId: "site-1",
	organizationId: "org-1",
	aiAgentId: "ai-1",
	sourceMessageId: "msg-1",
	sourceMessageCreatedAt: "2026-03-04T10:00:00.000Z",
	workflowRunId: "wf-1",
	jobId: "job-1",
};

function createDbMock() {
	const returningMock = mock(async () => [
		{
			id: "conv-1",
			visitorId: "visitor-1",
			titleSource: "ai",
		},
	]);
	const whereMock = mock(() => ({
		returning: returningMock,
	}));
	const setMock = mock(() => ({
		where: whereMock,
	}));
	const updateMock = mock(() => ({
		set: setMock,
	}));

	return {
		db: {
			update: updateMock,
		},
		updateMock,
		returningMock,
		setMock,
	};
}

describe("runBackgroundPipeline", () => {
	beforeEach(() => {
		logAiPipelineMock.mockClear();
		getAiAgentByIdMock.mockReset();
		getBehaviorSettingsMock.mockReset();
		resolveAndPersistModelMock.mockReset();
		loadConversationSeedMock.mockReset();
		loadIntakeContextMock.mockReset();
		emitPipelineProcessingCompletedMock.mockReset();
		runGenerationRuntimeMock.mockReset();
		runBackgroundKnowledgeGapReviewMock.mockReset();
		createModelMock.mockReset();
		runWithOpenRouterByokFallbackMock.mockReset();
		generateTextMock.mockReset();
		resolveModelForExecutionMock.mockReset();
		loadCurrentConversationMock.mockReset();
		realtimeEmitMock.mockReset();
		createTimelineItemMock.mockReset();
		syncConversationVisitorTitleMock.mockReset();

		getAiAgentByIdMock.mockResolvedValue({
			id: "ai-1",
			name: "Agent",
			model: "moonshotai/kimi-k2.5",
			basePrompt: "Help the visitor.",
			isActive: true,
			behaviorSettings: {},
		});
		getBehaviorSettingsMock.mockReturnValue({
			autoGenerateTitle: true,
			autoAnalyzeSentiment: true,
			canSetPriority: true,
			autoCategorize: false,
			canCategorize: false,
			canRequestKnowledgeClarification: true,
		});
		listActiveWebsiteViewsMock.mockReset();
		listActiveWebsiteViewsMock.mockResolvedValue([]);
		resolveAndPersistModelMock.mockImplementation(async ({ aiAgent }) => ({
			aiAgent,
			modelResolution: {
				modelIdResolved: aiAgent.model,
				modelIdOriginal: aiAgent.model,
				modelMigrationApplied: false,
			},
		}));
		loadConversationSeedMock.mockResolvedValue({
			conversation: {
				id: "conv-1",
				organizationId: "org-1",
				websiteId: "site-1",
				visitorId: "visitor-1",
				title: null as string | null,
				titleSource: null as "ai" | "user" | null,
				visitorTitle: null as string | null,
				visitorTitleLanguage: null as string | null,
			},
			triggerMetadata: {
				id: "msg-1",
				createdAt: "2026-03-04T10:00:00.000Z",
				conversationId: "conv-1",
			},
		});
		loadIntakeContextMock.mockResolvedValue({
			websiteDefaultLanguage: "en",
			visitorLanguage: "es",
			autoTranslateEnabled: true,
			conversationHistory: [],
			decisionMessages: [],
			generationEntries: [],
			visitorContext: null,
			conversationState: {
				hasHumanAssignee: false,
				assigneeIds: [],
				participantIds: [],
				isEscalated: false,
				escalationReason: null,
			},
			triggerMessage: {
				messageId: "msg-1",
				content: "Please help",
				senderType: "visitor",
				senderId: null,
				senderName: null,
				timestamp: "2026-03-04T10:00:00.000Z",
				visibility: "public",
			},
			hasLaterHumanMessage: false,
			hasLaterAiMessage: false,
		});
		runGenerationRuntimeMock.mockResolvedValue({
			status: "completed",
			action: {
				action: "skip",
				reasoning: "Updated sentiment",
				confidence: 1,
			},
			publicMessagesSent: 0,
			toolCallsByName: {
				updateSentiment: 1,
				skip: 1,
			},
			mutationToolCallsByName: {
				updateSentiment: 1,
			},
			totalToolCalls: 2,
		});
		runBackgroundKnowledgeGapReviewMock.mockResolvedValue({
			status: "skipped",
			reason: "no_candidate_gap",
		});
		createModelMock.mockImplementation((modelId: string) => modelId);
		runWithOpenRouterByokFallbackMock.mockImplementation(async (params) => ({
			result: await params.operation({
				model: createModelMock(params.modelId),
				billingSource: "cossistant" as const,
			}),
			billingSource: "cossistant" as const,
		}));
		generateTextMock.mockResolvedValue({
			output: {
				title: "Visitor asked for help",
				confidence: 0.9,
				reason: "Fallback title for a generic help request.",
			},
		});
		resolveModelForExecutionMock.mockImplementation((modelId: string) => ({
			modelIdResolved: modelId,
		}));
		loadCurrentConversationMock.mockResolvedValue({
			id: "conv-1",
			visitorId: "visitor-1",
			title: null,
			titleSource: null,
			visitorLanguage: "es",
		});
		realtimeEmitMock.mockResolvedValue(undefined);
		createTimelineItemMock.mockResolvedValue(undefined);
		syncConversationVisitorTitleMock.mockResolvedValue({
			visitorTitle: null,
			visitorTitleLanguage: null,
		});
	});

	it("skips when no background analysis capabilities are enabled", async () => {
		getBehaviorSettingsMock.mockReturnValue({
			autoGenerateTitle: false,
			autoAnalyzeSentiment: false,
			canSetPriority: false,
			autoCategorize: false,
			canCategorize: false,
			canRequestKnowledgeClarification: false,
		});

		const { runBackgroundPipeline } = await modulePromise;
		const result = await runBackgroundPipeline({
			db: {} as never,
			input: baseInput,
		});

		expect(result.status).toBe("skipped");
		expect(result.reason).toBe("No background analysis capabilities enabled");
		expect(runGenerationRuntimeMock).not.toHaveBeenCalled();
		expect(generateTextMock).not.toHaveBeenCalled();
		expect(emitPipelineProcessingCompletedMock).toHaveBeenCalledWith(
			expect.objectContaining({
				status: "skipped",
				workflowRunId: "wf-1",
				audience: "dashboard",
			})
		);
	});

	it("anchors analysis to the source message and restricts tools to metadata updates", async () => {
		const { runBackgroundPipeline } = await modulePromise;
		const result = await runBackgroundPipeline({
			db: {} as never,
			input: {
				...baseInput,
				sourceMessageId: "msg-42",
				sourceMessageCreatedAt: "2026-03-04T10:05:00.000Z",
			},
		});

		expect(result.status).toBe("completed");
		expect(loadConversationSeedMock).toHaveBeenCalledWith(expect.anything(), {
			conversationId: "conv-1",
			messageId: "msg-42",
			organizationId: "org-1",
		});
		expect(runGenerationRuntimeMock).toHaveBeenCalledWith(
			expect.objectContaining({
				pipelineKind: "background",
				mode: "background_only",
				triggerMessageId: "msg-42",
				triggerMessageCreatedAt: "2026-03-04T10:05:00.000Z",
				generationEntries: [],
				allowPublicMessages: false,
				hasLaterHumanMessage: false,
				hasLaterAiMessage: false,
				toolAllowlist: ["updateSentiment", "setPriority", "skip"],
				availableViews: [],
			})
		);
		expect(generateTextMock).toHaveBeenCalledTimes(1);
		expect(emitPipelineProcessingCompletedMock).toHaveBeenCalledWith(
			expect.objectContaining({
				status: "success",
				workflowRunId: "wf-1",
				audience: "dashboard",
			})
		);
	});

	it("passes multilingual title state into the background analysis runtime", async () => {
		loadConversationSeedMock.mockResolvedValueOnce({
			conversation: {
				id: "conv-1",
				organizationId: "org-1",
				websiteId: "site-1",
				visitorId: "visitor-1",
				title: "Billing question",
				titleSource: "ai",
				visitorTitle: "Pregunta de facturacion",
				visitorTitleLanguage: "es",
			},
			triggerMetadata: {
				id: "msg-1",
				createdAt: "2026-03-04T10:00:00.000Z",
				conversationId: "conv-1",
			},
		});
		loadIntakeContextMock.mockResolvedValueOnce({
			websiteDefaultLanguage: "en",
			visitorLanguage: "es",
			autoTranslateEnabled: true,
			conversationHistory: [],
			decisionMessages: [],
			generationEntries: [],
			visitorContext: null,
			conversationState: {
				hasHumanAssignee: false,
				assigneeIds: [],
				participantIds: [],
				isEscalated: false,
				escalationReason: null,
			},
			triggerMessage: {
				messageId: "msg-1",
				content: "Necesito ayuda con la facturacion",
				senderType: "visitor",
				senderId: null,
				senderName: null,
				timestamp: "2026-03-04T10:00:00.000Z",
				visibility: "public",
			},
			hasLaterHumanMessage: false,
			hasLaterAiMessage: false,
		});

		const { runBackgroundPipeline } = await modulePromise;
		const result = await runBackgroundPipeline({
			db: {} as never,
			input: baseInput,
		});

		expect(result.status).toBe("completed");
		expect(runGenerationRuntimeMock).toHaveBeenCalledWith(
			expect.objectContaining({
				websiteDefaultLanguage: "en",
				visitorLanguage: "es",
				autoTranslateEnabled: true,
				conversation: expect.objectContaining({
					title: "Billing question",
					titleSource: "ai",
					visitorTitle: "Pregunta de facturacion",
					visitorTitleLanguage: "es",
				}),
			})
		);
	});

	it("returns skipped when the analysis run makes no metadata mutation", async () => {
		getBehaviorSettingsMock.mockReturnValue({
			autoGenerateTitle: false,
			autoAnalyzeSentiment: true,
			canSetPriority: false,
			autoCategorize: false,
			canCategorize: false,
			canRequestKnowledgeClarification: false,
		});
		runGenerationRuntimeMock.mockResolvedValueOnce({
			status: "completed",
			action: {
				action: "skip",
				reasoning: "Nothing new to update",
				confidence: 1,
			},
			publicMessagesSent: 0,
			toolCallsByName: {
				skip: 1,
			},
			mutationToolCallsByName: {},
			totalToolCalls: 1,
		});

		const { runBackgroundPipeline } = await modulePromise;
		const result = await runBackgroundPipeline({
			db: {} as never,
			input: baseInput,
		});

		expect(result.status).toBe("skipped");
		expect(result.reason).toBe("Nothing new to update");
		expect(emitPipelineProcessingCompletedMock).toHaveBeenCalledWith(
			expect.objectContaining({
				status: "skipped",
				workflowRunId: "wf-1",
				audience: "dashboard",
			})
		);
	});

	it("returns completed when the dedicated title review updates the title even if generic analysis skips", async () => {
		generateTextMock.mockResolvedValueOnce({
			output: {
				title: "Invoice export issue",
				confidence: 0.93,
				reason: "Clear billing export topic",
			},
		});
		runGenerationRuntimeMock.mockResolvedValueOnce({
			status: "completed",
			action: {
				action: "skip",
				reasoning: "No generic metadata update",
				confidence: 1,
			},
			publicMessagesSent: 0,
			toolCallsByName: {
				skip: 1,
			},
			mutationToolCallsByName: {},
			totalToolCalls: 1,
		});

		const { runBackgroundPipeline } = await modulePromise;
		const { db } = createDbMock();
		const result = await runBackgroundPipeline({
			db: db as never,
			input: baseInput,
		});

		expect(result.status).toBe("completed");
		expect(emitPipelineProcessingCompletedMock).toHaveBeenCalledWith(
			expect.objectContaining({
				status: "success",
				action: "updateConversationTitle",
				reason: "Clear billing export topic",
				workflowRunId: "wf-1",
				audience: "dashboard",
			})
		);
	});

	it("schedules dedicated title review when title generation is the only enabled capability", async () => {
		getBehaviorSettingsMock.mockReturnValue({
			autoGenerateTitle: true,
			autoAnalyzeSentiment: false,
			canSetPriority: false,
			autoCategorize: false,
			canCategorize: false,
			canRequestKnowledgeClarification: false,
		});
		generateTextMock.mockResolvedValueOnce({
			output: {
				title: "Invoice export issue",
				confidence: 0.93,
				reason: "Clear topic",
			},
		});
		runGenerationRuntimeMock.mockResolvedValueOnce({
			status: "completed",
			action: {
				action: "skip",
				reasoning: "No generic metadata update",
				confidence: 1,
			},
			publicMessagesSent: 0,
			toolCallsByName: {
				skip: 1,
			},
			mutationToolCallsByName: {},
			totalToolCalls: 1,
		});

		const { runBackgroundPipeline } = await modulePromise;
		const { db } = createDbMock();
		const result = await runBackgroundPipeline({
			db: db as never,
			input: baseInput,
		});

		expect(result.status).toBe("completed");
		expect(generateTextMock).toHaveBeenCalledTimes(1);
		expect(runGenerationRuntimeMock).toHaveBeenCalledWith(
			expect.objectContaining({
				toolAllowlist: ["skip"],
			})
		);
	});

	it("loads active views and enables categorizeConversation when categorization is available", async () => {
		getBehaviorSettingsMock.mockReturnValue({
			autoGenerateTitle: false,
			autoAnalyzeSentiment: false,
			canSetPriority: false,
			autoCategorize: true,
			canCategorize: true,
			canRequestKnowledgeClarification: true,
		});
		listActiveWebsiteViewsMock.mockResolvedValueOnce([
			{
				id: "view-1",
				name: "billing",
				description: "Money and plan questions",
				prompt: "Use for billing issues",
			},
		]);

		const { runBackgroundPipeline } = await modulePromise;
		const result = await runBackgroundPipeline({
			db: {} as never,
			input: baseInput,
		});

		expect(result.status).toBe("completed");
		expect(listActiveWebsiteViewsMock).toHaveBeenCalledWith(expect.anything(), {
			websiteId: "site-1",
		});
		expect(runGenerationRuntimeMock).toHaveBeenCalledWith(
			expect.objectContaining({
				toolAllowlist: ["categorizeConversation", "skip"],
				availableViews: [
					{
						id: "view-1",
						name: "billing",
						description: "Money and plan questions",
						prompt: "Use for billing issues",
					},
				],
			})
		);
	});
});
