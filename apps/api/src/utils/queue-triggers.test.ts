import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

const getBullConnectionOptionsMock = mock(() => ({ host: "localhost" }));
const createAiAgentTriggersMock = mock(() => ({
	enqueueAiAgentJob: mock(async () => "job_1"),
	close: async () => {},
}));
const createAiAgentBackgroundTriggersMock = mock(() => ({
	enqueueAiAgentBackgroundJob: mock(async () => ({
		status: "queued",
	})),
	close: async () => {},
}));
const createAiTrainingTriggersMock = mock(() => ({
	enqueueAiTraining: mock(async () => "job_2"),
	cancelAiTraining: mock(async () => true),
	close: async () => {},
}));
const createLifecycleEmailTriggersMock = mock(() => ({
	enqueueScan: mock(async () => "job_4"),
	enqueueWeeklyDigestScan: mock(async () => "job_5"),
	enqueueLimitScan: mock(async () => "job_6"),
	enqueueSendBatch: mock(async () => "job_7"),
	close: async () => {},
}));
const createMessageNotificationTriggersMock = mock(() => ({
	triggerMemberMessageNotification: mock(async () => {}),
	triggerVisitorMessageNotification: mock(async () => {}),
	close: async () => {},
}));
const createWebCrawlTriggersMock = mock(() => ({
	enqueueWebCrawl: mock(async () => "job_3"),
	cancelWebCrawl: mock(async () => true),
	close: async () => {},
}));

mock.module("@api/env", () => ({
	env: {
		REDIS_URL: "",
	},
}));

mock.module("@cossistant/redis", () => ({
	getBullConnectionOptions: getBullConnectionOptionsMock,
}));

mock.module("@cossistant/jobs", () => ({
	createAiAgentBackgroundTriggers: createAiAgentBackgroundTriggersMock,
	createAiAgentTriggers: createAiAgentTriggersMock,
	createAiTrainingTriggers: createAiTrainingTriggersMock,
	createLifecycleEmailTriggers: createLifecycleEmailTriggersMock,
	createMessageNotificationTriggers: createMessageNotificationTriggersMock,
	createWebCrawlTriggers: createWebCrawlTriggersMock,
}));

describe("queue-triggers", () => {
	beforeEach(() => {
		getBullConnectionOptionsMock.mockClear();
		createAiAgentBackgroundTriggersMock.mockClear();
		createAiAgentTriggersMock.mockClear();
		createAiTrainingTriggersMock.mockClear();
		createLifecycleEmailTriggersMock.mockClear();
		createMessageNotificationTriggersMock.mockClear();
		createWebCrawlTriggersMock.mockClear();
	});

	afterAll(() => {
		mock.restore();
	});

	it("does not parse Redis URL at import time", async () => {
		await import(`./queue-triggers.ts?import=${Math.random()}`);

		expect(getBullConnectionOptionsMock).toHaveBeenCalledTimes(0);
		expect(createAiAgentTriggersMock).toHaveBeenCalledTimes(0);
	});

	it("throws only when trigger helpers are invoked without REDIS_URL", async () => {
		const module = await import(`./queue-triggers.ts?invoke=${Math.random()}`);

		expect(() => module.getAiAgentQueueTriggers()).toThrow(
			"[queue-triggers] REDIS_URL is required when queue triggers are invoked"
		);
		expect(getBullConnectionOptionsMock).toHaveBeenCalledTimes(0);
	});
});
