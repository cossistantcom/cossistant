import { beforeEach, describe, expect, it, mock } from "bun:test";
import type {
	AiAgentBackgroundJobData,
	AiAgentJobData,
} from "@cossistant/jobs";

type MockJob<T> = {
	id: string;
	attemptsMade: number;
	data: T;
};

type MockConversation = {
	id: string;
	websiteId: string;
	organizationId: string;
	visitorId: string;
	aiAgentLastProcessedMessageCreatedAt: string | null;
	aiAgentLastProcessedMessageId: string | null;
};

type MockMessage = {
	id: string;
	createdAt: string;
};

let processor:
	| ((job: MockJob<AiAgentJobData>) => Promise<{
			processedMessageId: string | null;
			processedMessageCreatedAt: string | null;
	  }>)
	| null = null;
let completedHandler:
	| ((
			job: MockJob<AiAgentJobData>,
			result: {
				processedMessageId: string | null;
				processedMessageCreatedAt: string | null;
			}
	  ) => void)
	| null = null;
let failedHandler:
	| ((job: MockJob<AiAgentJobData>, error: Error) => void)
	| null = null;

const workerWaitUntilReadyMock = mock(async () => {});
const workerCloseMock = mock(async () => {});
const queueWaitUntilReadyMock = mock(async () => {});
const queueCloseMock = mock(async () => {});

class MockWorker<T> {
	waitUntilReady = workerWaitUntilReadyMock;
	close = workerCloseMock;

	constructor(
		_queueName: string,
		processorFn: (job: MockJob<T>) => Promise<{
			processedMessageId: string | null;
			processedMessageCreatedAt: string | null;
		}>
	) {
		processor = processorFn as typeof processor;
	}

	on(
		event: string,
		handler:
			| ((
					job: MockJob<AiAgentJobData>,
					result: {
						processedMessageId: string | null;
						processedMessageCreatedAt: string | null;
					}
			  ) => void)
			| ((job: MockJob<AiAgentJobData>, error: Error) => void)
	) {
		if (event === "completed") {
			completedHandler = handler as typeof completedHandler;
		}
		if (event === "failed") {
			failedHandler = handler as typeof failedHandler;
		}
	}
}

class MockQueue<T> {
	waitUntilReady = queueWaitUntilReadyMock;
	close = queueCloseMock;
}

const getConversationByIdMock = mock(
	async (): Promise<MockConversation | null> => null
);
const getMessageMetadataMock = mock(
	async (): Promise<{
		id: string;
		createdAt: string;
		conversationId: string;
		userId: string | null;
		visitorId: string | null;
	} | null> => null
);
const getAiAgentByIdMock = mock(async () => ({
	id: "ai-1",
	behaviorSettings: {},
}));
const getBehaviorSettingsMock = mock(() => ({
	autoGenerateTitle: true,
	autoAnalyzeSentiment: true,
	canSetPriority: true,
	autoCategorize: false,
	canCategorize: false,
}));
const findNextTriggerableMessageAfterCursorMock = mock(
	async (): Promise<MockMessage | null> => null
);
const runPipelineForMessageMock = mock(
	async ({
		message,
	}: {
		message: MockMessage;
	}): Promise<{
		processedMessageId: string;
		processedMessageCreatedAt: string;
	}> => ({
		processedMessageId: message.id,
		processedMessageCreatedAt: message.createdAt,
	})
);
const enqueueConversationScopedAiJobMock = mock(
	async (): Promise<
		{ status: "created" } | { status: "skipped"; existingState: string }
	> => ({
		status: "created",
	})
);
const enqueueConversationScopedAiBackgroundJobMock = mock(
	async (): Promise<
		| { status: "created" }
		| { status: "rescheduled"; previousState: "delayed" | "waiting" }
		| { status: "skipped_active" }
		| { status: "skipped_unexpected"; existingState: string }
	> => ({
		status: "created",
	})
);

class PipelineMessageError extends Error {
	failedMessage: { id: string; createdAt: string };
	openRouterByokRetry?: AiAgentJobData["openRouterByokRetry"];
	constructor(
		message: string,
		failedMessage: { id: string; createdAt: string },
		openRouterByokRetry?: AiAgentJobData["openRouterByokRetry"]
	) {
		super(message);
		this.failedMessage = failedMessage;
		this.openRouterByokRetry = openRouterByokRetry;
	}
}

mock.module("bullmq", () => ({
	Worker: MockWorker,
	Queue: MockQueue,
}));

mock.module("@api/db/queries/conversation", () => ({
	getConversationById: getConversationByIdMock,
	getMessageMetadata: getMessageMetadataMock,
}));

mock.module("@api/db/queries/ai-agent", () => ({
	getAiAgentById: getAiAgentByIdMock,
}));

mock.module("@api/ai-pipeline/shared/settings", () => ({
	getBehaviorSettings: getBehaviorSettingsMock,
}));

mock.module("@cossistant/jobs", () => ({
	QUEUE_NAMES: {
		AI_AGENT: "ai-agent",
		AI_AGENT_BACKGROUND: "ai-agent-background",
	},
	AI_AGENT_BACKGROUND_DELAY_MS: 30_000,
	generateAiAgentJobId: (conversationId: string) =>
		`ai-agent-${conversationId}`,
	AI_AGENT_INITIAL_DELAY_MS: 5000,
	AI_AGENT_RETRY_DELAY_MS: 5000,
	AI_AGENT_MAX_RUN_ATTEMPTS: 3,
	enqueueConversationScopedAiBackgroundJob:
		enqueueConversationScopedAiBackgroundJobMock,
	enqueueConversationScopedAiJob: enqueueConversationScopedAiJobMock,
}));

mock.module("./next-triggerable-message", () => ({
	findNextTriggerableMessageAfterCursor:
		findNextTriggerableMessageAfterCursorMock,
}));

mock.module("./pipeline-runner", () => ({
	PipelineMessageError,
	runPipelineForMessage: runPipelineForMessageMock,
}));

mock.module("@workers/db", () => ({ db: {} }));
mock.module("@workers/env", () => ({ env: { AI_AGENT_CONCURRENCY: 7 } }));
mock.module("@cossistant/redis", () => ({
	getSafeRedisUrl: () => "redis://masked",
}));

const modulePromise = import("./worker");

function buildJobData(overrides: Partial<AiAgentJobData> = {}): AiAgentJobData {
	return {
		conversationId: "conv-1",
		websiteId: "site-1",
		organizationId: "org-1",
		aiAgentId: "ai-1",
		messageId: "msg-1",
		messageCreatedAt: "2026-03-04T10:00:00.000Z",
		...overrides,
	};
}

async function runJob(data: AiAgentJobData) {
	if (!processor) {
		throw new Error("processor not initialized");
	}
	const job: MockJob<AiAgentJobData> = {
		id: "job-1",
		attemptsMade: 0,
		data,
	};

	try {
		const result = await processor(job);
		completedHandler?.(job, result);
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		return result;
	} catch (error) {
		failedHandler?.(job, error as Error);
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		throw error;
	}
}

describe("ai-agent worker single-message orchestration", () => {
	beforeEach(() => {
		processor = null;
		completedHandler = null;
		failedHandler = null;

		workerWaitUntilReadyMock.mockReset();
		workerCloseMock.mockReset();
		queueWaitUntilReadyMock.mockReset();
		queueCloseMock.mockReset();
		getConversationByIdMock.mockReset();
		getMessageMetadataMock.mockReset();
		getAiAgentByIdMock.mockReset();
		getBehaviorSettingsMock.mockReset();
		findNextTriggerableMessageAfterCursorMock.mockReset();
		runPipelineForMessageMock.mockReset();
		enqueueConversationScopedAiJobMock.mockReset();
		enqueueConversationScopedAiBackgroundJobMock.mockReset();

		workerWaitUntilReadyMock.mockResolvedValue(undefined);
		workerCloseMock.mockResolvedValue(undefined);
		queueWaitUntilReadyMock.mockResolvedValue(undefined);
		queueCloseMock.mockResolvedValue(undefined);
		getMessageMetadataMock.mockResolvedValue({
			id: "msg-1",
			createdAt: "2026-03-04T10:00:00.000Z",
			conversationId: "conv-1",
			userId: null,
			visitorId: "visitor-1",
		});
		getAiAgentByIdMock.mockResolvedValue({
			id: "ai-1",
			behaviorSettings: {},
		});
		getBehaviorSettingsMock.mockReturnValue({
			autoGenerateTitle: true,
			autoAnalyzeSentiment: true,
			canSetPriority: true,
			autoCategorize: false,
			canCategorize: false,
		});
		findNextTriggerableMessageAfterCursorMock.mockResolvedValue(null);
		runPipelineForMessageMock.mockImplementation(
			async ({ message }: { message: MockMessage }) => ({
				processedMessageId: message.id,
				processedMessageCreatedAt: message.createdAt,
			})
		);
		enqueueConversationScopedAiJobMock.mockResolvedValue({ status: "created" });
		enqueueConversationScopedAiBackgroundJobMock.mockResolvedValue({
			status: "created",
		});
	});

	it("processes the queued message once when the conversation cursor is empty", async () => {
		getConversationByIdMock
			.mockResolvedValueOnce({
				id: "conv-1",
				websiteId: "site-1",
				organizationId: "org-1",
				visitorId: "visitor-1",
				aiAgentLastProcessedMessageCreatedAt: null,
				aiAgentLastProcessedMessageId: null,
			})
			.mockResolvedValueOnce({
				id: "conv-1",
				websiteId: "site-1",
				organizationId: "org-1",
				visitorId: "visitor-1",
				aiAgentLastProcessedMessageCreatedAt: "2026-03-04T10:00:00.000Z",
				aiAgentLastProcessedMessageId: "msg-1",
			});

		const { createAiAgentWorker } = await modulePromise;
		const worker = createAiAgentWorker({
			connectionOptions: {} as never,
			redisUrl: "redis://localhost:6379",
		});

		await worker.start();
		await runJob(buildJobData());

		expect(runPipelineForMessageMock).toHaveBeenCalledTimes(1);
		expect(runPipelineForMessageMock).toHaveBeenCalledWith({
			db: expect.anything(),
			conversation: {
				id: "conv-1",
				websiteId: "site-1",
				organizationId: "org-1",
				visitorId: "visitor-1",
			},
			aiAgentId: "ai-1",
			jobId: "job-1",
			message: {
				id: "msg-1",
				createdAt: "2026-03-04T10:00:00.000Z",
			},
		});
		expect(enqueueConversationScopedAiJobMock).not.toHaveBeenCalled();
		expect(enqueueConversationScopedAiBackgroundJobMock).toHaveBeenCalledWith({
			queue: expect.anything(),
			data: {
				conversationId: "conv-1",
				websiteId: "site-1",
				organizationId: "org-1",
				aiAgentId: "ai-1",
				sourceMessageId: "msg-1",
				sourceMessageCreatedAt: "2026-03-04T10:00:00.000Z",
			},
			delayMs: 30_000,
		});

		await worker.stop();
	});

	it("schedules background work when auto-categorization is the only enabled capability", async () => {
		getBehaviorSettingsMock.mockReturnValue({
			autoGenerateTitle: false,
			autoAnalyzeSentiment: false,
			canSetPriority: false,
			autoCategorize: true,
			canCategorize: true,
		});
		getConversationByIdMock
			.mockResolvedValueOnce({
				id: "conv-1",
				websiteId: "site-1",
				organizationId: "org-1",
				visitorId: "visitor-1",
				aiAgentLastProcessedMessageCreatedAt: null,
				aiAgentLastProcessedMessageId: null,
			})
			.mockResolvedValueOnce({
				id: "conv-1",
				websiteId: "site-1",
				organizationId: "org-1",
				visitorId: "visitor-1",
				aiAgentLastProcessedMessageCreatedAt: "2026-03-04T10:00:00.000Z",
				aiAgentLastProcessedMessageId: "msg-1",
			});

		const { createAiAgentWorker } = await modulePromise;
		const worker = createAiAgentWorker({
			connectionOptions: {} as never,
			redisUrl: "redis://localhost:6379",
		});

		await worker.start();
		await runJob(buildJobData());

		expect(enqueueConversationScopedAiBackgroundJobMock).toHaveBeenCalledTimes(
			1
		);

		await worker.stop();
	});

	it("schedules background work when title generation is the only enabled capability", async () => {
		getBehaviorSettingsMock.mockReturnValue({
			autoGenerateTitle: true,
			autoAnalyzeSentiment: false,
			canSetPriority: false,
			autoCategorize: false,
			canCategorize: false,
		});
		getConversationByIdMock
			.mockResolvedValueOnce({
				id: "conv-1",
				websiteId: "site-1",
				organizationId: "org-1",
				visitorId: "visitor-1",
				aiAgentLastProcessedMessageCreatedAt: null,
				aiAgentLastProcessedMessageId: null,
			})
			.mockResolvedValueOnce({
				id: "conv-1",
				websiteId: "site-1",
				organizationId: "org-1",
				visitorId: "visitor-1",
				aiAgentLastProcessedMessageCreatedAt: "2026-03-04T10:00:00.000Z",
				aiAgentLastProcessedMessageId: "msg-1",
			});

		const { createAiAgentWorker } = await modulePromise;
		const worker = createAiAgentWorker({
			connectionOptions: {} as never,
			redisUrl: "redis://localhost:6379",
		});

		await worker.start();
		await runJob(buildJobData());

		expect(enqueueConversationScopedAiBackgroundJobMock).toHaveBeenCalledWith({
			queue: expect.anything(),
			data: {
				conversationId: "conv-1",
				websiteId: "site-1",
				organizationId: "org-1",
				aiAgentId: "ai-1",
				sourceMessageId: "msg-1",
				sourceMessageCreatedAt: "2026-03-04T10:00:00.000Z",
			},
			delayMs: 30_000,
		});

		await worker.stop();
	});

	it("processes only the earliest pending message after the DB cursor and cascades the next job", async () => {
		getConversationByIdMock
			.mockResolvedValueOnce({
				id: "conv-1",
				websiteId: "site-1",
				organizationId: "org-1",
				visitorId: "visitor-1",
				aiAgentLastProcessedMessageCreatedAt: "2026-03-04T10:00:00.000Z",
				aiAgentLastProcessedMessageId: "msg-1",
			})
			.mockResolvedValueOnce({
				id: "conv-1",
				websiteId: "site-1",
				organizationId: "org-1",
				visitorId: "visitor-1",
				aiAgentLastProcessedMessageCreatedAt: "2026-03-04T10:00:01.000Z",
				aiAgentLastProcessedMessageId: "msg-2",
			});
		findNextTriggerableMessageAfterCursorMock
			.mockResolvedValueOnce({
				id: "msg-2",
				createdAt: "2026-03-04T10:00:01.000Z",
			})
			.mockResolvedValueOnce({
				id: "msg-3",
				createdAt: "2026-03-04T10:00:02.000Z",
			});

		const { createAiAgentWorker } = await modulePromise;
		const worker = createAiAgentWorker({
			connectionOptions: {} as never,
			redisUrl: "redis://localhost:6379",
		});

		await worker.start();
		await runJob(
			buildJobData({
				messageId: "msg-3",
				messageCreatedAt: "2026-03-04T10:00:02.000Z",
			})
		);

		expect(runPipelineForMessageMock).toHaveBeenCalledTimes(1);
		expect(runPipelineForMessageMock).toHaveBeenCalledWith(
			expect.objectContaining({
				message: {
					id: "msg-2",
					createdAt: "2026-03-04T10:00:01.000Z",
				},
			})
		);
		expect(enqueueConversationScopedAiJobMock).toHaveBeenCalledWith({
			queue: expect.anything(),
			data: {
				conversationId: "conv-1",
				websiteId: "site-1",
				organizationId: "org-1",
				aiAgentId: "ai-1",
				messageId: "msg-3",
				messageCreatedAt: "2026-03-04T10:00:02.000Z",
				runAttempt: 0,
			},
			delayMs: 0,
		});

		await worker.stop();
	});

	it("skips stale jobs that are already at or behind the DB cursor", async () => {
		getConversationByIdMock.mockResolvedValueOnce({
			id: "conv-1",
			websiteId: "site-1",
			organizationId: "org-1",
			visitorId: "visitor-1",
			aiAgentLastProcessedMessageCreatedAt: "2026-03-04T10:00:01.000Z",
			aiAgentLastProcessedMessageId: "msg-2",
		});
		findNextTriggerableMessageAfterCursorMock.mockResolvedValueOnce(null);

		const { createAiAgentWorker } = await modulePromise;
		const worker = createAiAgentWorker({
			connectionOptions: {} as never,
			redisUrl: "redis://localhost:6379",
		});

		await worker.start();
		await runJob(buildJobData());

		expect(runPipelineForMessageMock).not.toHaveBeenCalled();
		expect(enqueueConversationScopedAiJobMock).not.toHaveBeenCalled();
		expect(enqueueConversationScopedAiBackgroundJobMock).not.toHaveBeenCalled();

		await worker.stop();
	});

	it("retries the actual failed target message instead of the later queued payload", async () => {
		getConversationByIdMock.mockResolvedValueOnce({
			id: "conv-1",
			websiteId: "site-1",
			organizationId: "org-1",
			visitorId: "visitor-1",
			aiAgentLastProcessedMessageCreatedAt: "2026-03-04T10:00:00.000Z",
			aiAgentLastProcessedMessageId: "msg-1",
		});
		findNextTriggerableMessageAfterCursorMock.mockResolvedValueOnce({
			id: "msg-2",
			createdAt: "2026-03-04T10:00:01.000Z",
		});
		runPipelineForMessageMock.mockRejectedValueOnce(
			new PipelineMessageError("boom", {
				id: "msg-2",
				createdAt: "2026-03-04T10:00:01.000Z",
			})
		);

		const { createAiAgentWorker } = await modulePromise;
		const worker = createAiAgentWorker({
			connectionOptions: {} as never,
			redisUrl: "redis://localhost:6379",
		});

		await worker.start();
		await expect(
			runJob(
				buildJobData({
					messageId: "msg-3",
					messageCreatedAt: "2026-03-04T10:00:02.000Z",
					runAttempt: 0,
				})
			)
		).rejects.toThrow("boom");

		expect(enqueueConversationScopedAiJobMock).toHaveBeenCalledWith({
			queue: expect.anything(),
			data: {
				conversationId: "conv-1",
				websiteId: "site-1",
				organizationId: "org-1",
				aiAgentId: "ai-1",
				messageId: "msg-2",
				messageCreatedAt: "2026-03-04T10:00:01.000Z",
				runAttempt: 1,
			},
			delayMs: 5000,
		});
		expect(enqueueConversationScopedAiBackgroundJobMock).not.toHaveBeenCalled();

		await worker.stop();
	});

	it("carries OpenRouter BYOK retry state into the next retry job", async () => {
		const openRouterByokRetry: AiAgentJobData["openRouterByokRetry"] = {
			mode: "cossistant",
			customerFailureCount: 2,
			lastErrorCode: "provider_error",
			lastFailedAt: "2026-05-26T10:00:00.000Z",
		};
		getConversationByIdMock.mockResolvedValueOnce({
			id: "conv-1",
			websiteId: "site-1",
			organizationId: "org-1",
			visitorId: "visitor-1",
			aiAgentLastProcessedMessageCreatedAt: null,
			aiAgentLastProcessedMessageId: null,
		});
		runPipelineForMessageMock.mockRejectedValueOnce(
			new PipelineMessageError(
				"byok retry",
				{
					id: "msg-1",
					createdAt: "2026-03-04T10:00:00.000Z",
				},
				openRouterByokRetry
			)
		);

		const { createAiAgentWorker } = await modulePromise;
		const worker = createAiAgentWorker({
			connectionOptions: {} as never,
			redisUrl: "redis://localhost:6379",
		});

		await worker.start();
		await expect(runJob(buildJobData({ runAttempt: 1 }))).rejects.toThrow(
			"byok retry"
		);

		expect(enqueueConversationScopedAiJobMock).toHaveBeenCalledWith({
			queue: expect.anything(),
			data: {
				conversationId: "conv-1",
				websiteId: "site-1",
				organizationId: "org-1",
				aiAgentId: "ai-1",
				messageId: "msg-1",
				messageCreatedAt: "2026-03-04T10:00:00.000Z",
				runAttempt: 2,
				openRouterByokRetry,
			},
			delayMs: 5000,
		});

		await worker.stop();
	});

	it("stops retrying after max attempts", async () => {
		getConversationByIdMock.mockResolvedValueOnce({
			id: "conv-1",
			websiteId: "site-1",
			organizationId: "org-1",
			visitorId: "visitor-1",
			aiAgentLastProcessedMessageCreatedAt: null,
			aiAgentLastProcessedMessageId: null,
		});
		runPipelineForMessageMock.mockRejectedValueOnce(
			new PipelineMessageError("boom", {
				id: "msg-1",
				createdAt: "2026-03-04T10:00:00.000Z",
			})
		);

		const { createAiAgentWorker } = await modulePromise;
		const worker = createAiAgentWorker({
			connectionOptions: {} as never,
			redisUrl: "redis://localhost:6379",
		});

		await worker.start();
		await expect(runJob(buildJobData({ runAttempt: 2 }))).rejects.toThrow(
			"boom"
		);

		expect(enqueueConversationScopedAiJobMock).not.toHaveBeenCalled();

		await worker.stop();
	});
});
