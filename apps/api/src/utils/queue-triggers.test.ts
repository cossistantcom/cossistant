import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

const getBullConnectionOptionsMock = mock(() => ({ host: "localhost" }));
const createAiAgentTriggersMock = mock(() => ({
	enqueueAiAgentJob: mock(async () => "job_1"),
	close: async () => {},
}));
const createAiTrainingTriggersMock = mock(() => ({
	enqueueAiTraining: mock(async () => "job_2"),
	cancelAiTraining: mock(async () => true),
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

mock.module("@plasma/redis", () => ({
	getBullConnectionOptions: getBullConnectionOptionsMock,
}));

mock.module("@plasma/jobs", () => ({
	createAiAgentTriggers: createAiAgentTriggersMock,
	createAiTrainingTriggers: createAiTrainingTriggersMock,
	createMessageNotificationTriggers: createMessageNotificationTriggersMock,
	createWebCrawlTriggers: createWebCrawlTriggersMock,
}));

describe("queue-triggers", () => {
	beforeEach(() => {
		getBullConnectionOptionsMock.mockClear();
		createAiAgentTriggersMock.mockClear();
		createAiTrainingTriggersMock.mockClear();
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
