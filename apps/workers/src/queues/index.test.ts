import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

const getBullConnectionOptionsMock = mock(() => ({}));

function createWorkerFactoryMock() {
	const start = mock(async () => {});
	const stop = mock(async () => {});
	const factory = mock(() => ({ start, stop }));
	return { factory, start, stop };
}

const messageNotification = createWorkerFactoryMock();
const aiAgent = createWorkerFactoryMock();
const aiAgentBackground = createWorkerFactoryMock();
const webCrawl = createWorkerFactoryMock();
const aiTraining = createWorkerFactoryMock();
const lifecycleEmail = createWorkerFactoryMock();

mock.module("@cossistant/redis", () => ({
	getBullConnectionOptions: getBullConnectionOptionsMock,
	// mock.module replaces the whole module, so the other exports the worker
	// graph imports have to be present even though this test never calls them.
	createRedisConnection: () => ({}),
	getRedisConnectionOptions: () => ({}),
	getSafeRedisUrl: () => "redis://localhost:6379",
}));

mock.module("./message-notification/worker", () => ({
	createMessageNotificationWorker: messageNotification.factory,
}));

mock.module("./ai-agent/worker", () => ({
	createAiAgentWorker: aiAgent.factory,
}));

mock.module("./ai-agent-background/worker", () => ({
	createAiAgentBackgroundWorker: aiAgentBackground.factory,
}));

mock.module("./web-crawl/worker", () => ({
	createWebCrawlWorker: webCrawl.factory,
}));

mock.module("./ai-training/worker", () => ({
	createAiTrainingWorker: aiTraining.factory,
}));

// Left unmocked this builds a real BullMQ worker and opens a Redis connection,
// so the suite could only pass against a live Redis.
mock.module("./lifecycle-email/worker", () => ({
	createLifecycleEmailWorker: lifecycleEmail.factory,
}));

const modulePromise = import("./index");

describe("workers bootstrap idempotency", () => {
	afterAll(() => {
		mock.restore();
	});

	beforeEach(async () => {
		getBullConnectionOptionsMock.mockReset();
		messageNotification.factory.mockReset();
		messageNotification.start.mockReset();
		messageNotification.stop.mockReset();
		aiAgent.factory.mockReset();
		aiAgent.start.mockReset();
		aiAgent.stop.mockReset();
		aiAgentBackground.factory.mockReset();
		aiAgentBackground.start.mockReset();
		aiAgentBackground.stop.mockReset();
		webCrawl.factory.mockReset();
		webCrawl.start.mockReset();
		webCrawl.stop.mockReset();
		aiTraining.factory.mockReset();
		aiTraining.start.mockReset();
		aiTraining.stop.mockReset();

		getBullConnectionOptionsMock.mockReturnValue({});
		messageNotification.factory.mockImplementation(() => ({
			start: messageNotification.start,
			stop: messageNotification.stop,
		}));
		aiAgent.factory.mockImplementation(() => ({
			start: aiAgent.start,
			stop: aiAgent.stop,
		}));
		aiAgentBackground.factory.mockImplementation(() => ({
			start: aiAgentBackground.start,
			stop: aiAgentBackground.stop,
		}));
		webCrawl.factory.mockImplementation(() => ({
			start: webCrawl.start,
			stop: webCrawl.stop,
		}));
		aiTraining.factory.mockImplementation(() => ({
			start: aiTraining.start,
			stop: aiTraining.stop,
		}));

		const { stopAllWorkers } = await modulePromise;
		await stopAllWorkers();
	});

	it("starts workers only once when startAllWorkers is called repeatedly", async () => {
		const { startAllWorkers, stopAllWorkers } = await modulePromise;
		const params = {
			redisUrl: "redis://localhost:6379",
		};

		await Promise.all([startAllWorkers(params), startAllWorkers(params)]);

		expect(messageNotification.factory).toHaveBeenCalledTimes(1);
		expect(aiAgent.factory).toHaveBeenCalledTimes(1);
		expect(aiAgentBackground.factory).toHaveBeenCalledTimes(1);
		expect(webCrawl.factory).toHaveBeenCalledTimes(1);
		expect(aiTraining.factory).toHaveBeenCalledTimes(1);

		expect(messageNotification.start).toHaveBeenCalledTimes(1);
		expect(aiAgent.start).toHaveBeenCalledTimes(1);
		expect(aiAgentBackground.start).toHaveBeenCalledTimes(1);
		expect(webCrawl.start).toHaveBeenCalledTimes(1);
		expect(aiTraining.start).toHaveBeenCalledTimes(1);

		await stopAllWorkers();
	});
});
