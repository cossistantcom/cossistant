import { beforeEach, describe, expect, it, mock } from "bun:test";
import { AI_AGENT_BACKGROUND_DELAY_MS } from "../ai-agent-background-job-scheduler";
import type { AiAgentBackgroundJobData } from "../types";

type MockJobState =
	| "active"
	| "waiting"
	| "delayed"
	| "completed"
	| "failed"
	| "paused";

const waitUntilReadyMock = mock(async () => {});
const closeMock = mock(async () => {});
const addMock = mock(
	async (
		name: string,
		data: AiAgentBackgroundJobData,
		opts: Record<string, unknown>
	) => {
		lastAddedName = name;
		lastAddedJobId = String(opts.jobId ?? "");
		lastAddedData = data;
		lastAddedOptions = opts;
		existingJobState = "waiting";
		existingJobData = data;
		return {
			id: "job-1",
			data,
			getState: async () => "waiting",
		};
	}
);

let existingJobState: MockJobState | null = null;
let existingJobData: AiAgentBackgroundJobData | null = null;
let lastAddedName: string | null = null;
let lastAddedJobId: string | null = null;
let lastAddedData: AiAgentBackgroundJobData | null = null;
let lastAddedOptions: Record<string, unknown> | null = null;
let removedExistingJobCount = 0;

class MockQueue<T extends AiAgentBackgroundJobData> {
	waitUntilReady = waitUntilReadyMock;
	close = closeMock;
	add = addMock;

	async getJob(jobId: string) {
		if (!existingJobState) {
			return null;
		}

		return {
			id: jobId,
			data: existingJobData as T,
			getState: async () => existingJobState,
			remove: async () => {
				removedExistingJobCount += 1;
				existingJobState = null;
				existingJobData = null;
			},
		};
	}
}

mock.module("bullmq", () => ({
	Queue: MockQueue,
}));

const triggerModulePromise = import("./ai-agent-background");

function buildJobData(
	overrides: Partial<AiAgentBackgroundJobData> = {}
): AiAgentBackgroundJobData {
	return {
		conversationId: "conv-1",
		websiteId: "site-1",
		organizationId: "org-1",
		aiAgentId: "ai-1",
		sourceMessageId: "msg-1",
		sourceMessageCreatedAt: "2026-03-04T10:00:00.000Z",
		...overrides,
	};
}

describe("createAiAgentBackgroundTriggers", () => {
	beforeEach(() => {
		waitUntilReadyMock.mockReset();
		closeMock.mockReset();
		addMock.mockReset();

		waitUntilReadyMock.mockResolvedValue(undefined);
		closeMock.mockResolvedValue(undefined);
		addMock.mockImplementation(
			async (
				name: string,
				data: AiAgentBackgroundJobData,
				opts: Record<string, unknown>
			) => {
				lastAddedName = name;
				lastAddedJobId = String(opts.jobId ?? "");
				lastAddedData = data;
				lastAddedOptions = opts;
				existingJobState = "waiting";
				existingJobData = data;
				return {
					id: "job-1",
					data,
					getState: async () => "waiting",
				};
			}
		);

		existingJobState = null;
		existingJobData = null;
		lastAddedName = null;
		lastAddedJobId = null;
		lastAddedData = null;
		lastAddedOptions = null;
		removedExistingJobCount = 0;
	});

	it("enqueues with conversation-scoped id and default delay", async () => {
		const { createAiAgentBackgroundTriggers } = await triggerModulePromise;
		const triggers = createAiAgentBackgroundTriggers({
			connection: {} as never,
			redisUrl: "redis://localhost:6379",
		});

		const result = await triggers.enqueueAiAgentBackgroundJob(buildJobData());

		expect(result).toEqual({ status: "created" });
		expect(lastAddedName).toBe("ai-agent-background");
		expect(lastAddedJobId).toBe("ai-agent-background-conv-1");
		expect(lastAddedData?.conversationId).toBe("conv-1");
		// Read the default from the scheduler so retuning it does not break this.
		expect(lastAddedOptions?.delay).toBe(AI_AGENT_BACKGROUND_DELAY_MS);
		expect(lastAddedOptions?.removeOnComplete).toBe(true);
		expect(lastAddedOptions?.removeOnFail).toBe(true);

		await triggers.close();
	});

	it("reschedules delayed/waiting jobs by removing previous one first", async () => {
		existingJobState = "delayed";
		existingJobData = buildJobData();
		const { createAiAgentBackgroundTriggers } = await triggerModulePromise;
		const triggers = createAiAgentBackgroundTriggers({
			connection: {} as never,
			redisUrl: "redis://localhost:6379",
		});

		const result = await triggers.enqueueAiAgentBackgroundJob(buildJobData());

		expect(result).toEqual({
			status: "rescheduled",
			previousState: "delayed",
		});
		expect(removedExistingJobCount).toBe(1);
		expect(addMock).toHaveBeenCalledTimes(1);

		await triggers.close();
	});

	it("skips enqueue when an active job exists", async () => {
		existingJobState = "active";
		existingJobData = buildJobData();
		const { createAiAgentBackgroundTriggers } = await triggerModulePromise;
		const triggers = createAiAgentBackgroundTriggers({
			connection: {} as never,
			redisUrl: "redis://localhost:6379",
		});

		const result = await triggers.enqueueAiAgentBackgroundJob(buildJobData());

		expect(result).toEqual({ status: "skipped_active" });
		expect(addMock).not.toHaveBeenCalled();
		expect(removedExistingJobCount).toBe(0);

		await triggers.close();
	});

	it("supports delay override", async () => {
		const { createAiAgentBackgroundTriggers } = await triggerModulePromise;
		const triggers = createAiAgentBackgroundTriggers({
			connection: {} as never,
			redisUrl: "redis://localhost:6379",
		});

		await triggers.enqueueAiAgentBackgroundJob(buildJobData(), {
			delayMs: 5000,
		});

		expect(lastAddedOptions?.delay).toBe(5000);

		await triggers.close();
	});

	it("returns skipped_unexpected for unsupported states", async () => {
		existingJobState = "paused";
		existingJobData = buildJobData();
		const { createAiAgentBackgroundTriggers } = await triggerModulePromise;
		const triggers = createAiAgentBackgroundTriggers({
			connection: {} as never,
			redisUrl: "redis://localhost:6379",
		});

		const result = await triggers.enqueueAiAgentBackgroundJob(buildJobData());

		expect(result).toEqual({
			status: "skipped_unexpected",
			existingState: "paused",
		});
		expect(addMock).not.toHaveBeenCalled();

		await triggers.close();
	});
});
