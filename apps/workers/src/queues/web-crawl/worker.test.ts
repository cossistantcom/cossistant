import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { WebCrawlJobData } from "@plasma/jobs";

type MockCrawlStatus = {
	status: "pending" | "crawling" | "completed" | "failed";
	rawStatus?: string | null;
	progress?: {
		completed: number;
		total: number;
	};
	materializedPageCount?: number;
	paginationTruncated?: boolean;
	statusCode?: number;
	retryable?: boolean;
	pages?: Array<{
		url: string;
		title: string | null;
		markdown: string;
		sizeBytes: number;
	}>;
	error?: string;
};

type MockCrawlPage = NonNullable<MockCrawlStatus["pages"]>[number];

type MockLinkSource = {
	id: string;
	websiteId: string;
	status: "pending" | "mapping" | "crawling" | "completed" | "failed";
	includePaths: string[] | null;
	excludePaths: string[] | null;
	ignoredUrls: string[] | null;
	discoveredPagesCount: number;
	crawledPagesCount: number;
	totalSizeBytes: number;
	firecrawlJobId?: string | null;
	deletedAt?: string | null;
	errorMessage?: string | null;
};

type StatusRequest = {
	jobId: string;
	options?: { includeAllPages?: boolean };
};

const updateLinkSourceEvents: Record<string, unknown>[] = [];
const realtimeEvents: {
	event: string;
	payload: Record<string, unknown>;
}[] = [];
const statusRequests: StatusRequest[] = [];
const progressCalls: number[] = [];
const operationLog: string[] = [];
const startCrawlCalls: Array<{
	url: string;
	options: Record<string, unknown>;
}> = [];
const delayedCalls: Array<{
	jobId: string;
	timestamp: number;
	token: string;
}> = [];

let linkSourceState: MockLinkSource | null = null;
let crawlStatusSequence: MockCrawlStatus[] = [];
let crawlStatusFallback: MockCrawlStatus | null = null;
let knowledgeIdCounter = 0;
let jobCounter = 0;

const getLinkSourceByIdMock = mock(async () => {
	if (!linkSourceState) {
		return null;
	}

	return { ...linkSourceState };
});

const updateLinkSourceMock = mock(
	async (
		_db: unknown,
		params: Record<string, unknown>
	): Promise<MockLinkSource | null> => {
		updateLinkSourceEvents.push(params);
		if (params.status === "failed") {
			operationLog.push("update:failed");
		}

		if (!linkSourceState) {
			return null;
		}

		linkSourceState = {
			...linkSourceState,
			...params,
		} as MockLinkSource;

		return { ...linkSourceState };
	}
);

const getLinkSourceTotalSizeMock = mock(async () => 0);
const deleteKnowledgeByLinkSourceMock = mock(async () => 0);
const upsertKnowledgeMock = mock(async () => {
	knowledgeIdCounter += 1;
	return { id: `knowledge-${knowledgeIdCounter}` };
});
const getWebsiteByIdMock = mock(async () => ({
	id: "site-1",
	organizationId: "org-1",
}));
const getPlanForWebsiteMock = mock(async () => ({
	features: {
		"ai-agent-training-mb": null,
	},
}));
const emitToWebsiteMock = mock(
	async (
		_websiteId: string,
		event: string,
		payload: Record<string, unknown>
	) => {
		realtimeEvents.push({ event, payload });
	}
);

const isConfiguredMock = mock(() => true);
const startCrawlMock = mock(
	async (url: string, options?: Record<string, unknown>) => {
		startCrawlCalls.push({
			url,
			options: options ?? {},
		});
		operationLog.push("startCrawl");
		return {
			success: true,
			jobId: "fc-job-1",
		};
	}
);
const getCrawlStatusMock = mock(
	async (jobId: string, options?: { includeAllPages?: boolean }) => {
		statusRequests.push({ jobId, options });

		if (crawlStatusSequence.length > 0) {
			const nextStatus = crawlStatusSequence.shift();
			if (nextStatus) {
				return nextStatus;
			}
		}

		if (!crawlStatusFallback) {
			throw new Error("No crawl status configured for test");
		}

		return crawlStatusFallback;
	}
);
const cancelCrawlMock = mock(async () => {
	operationLog.push("cancelCrawl");
	return { success: true };
});
const getCrawlErrorsMock = mock(async () => ({
	success: true,
	errors: [],
}));

class MockFirecrawlService {
	isConfigured = isConfiguredMock;
	startCrawl = startCrawlMock;
	getCrawlStatus = getCrawlStatusMock;
	cancelCrawl = cancelCrawlMock;
	getCrawlErrors = getCrawlErrorsMock;
}

class MockDelayedError extends Error {}

class MockWorker<T> {
	on(_event: string, _handler: (...args: unknown[]) => void) {}
	waitUntilReady = mock(async () => {});
	close = mock(async () => {});
}

class MockQueue<T> {
	waitUntilReady = mock(async () => {});
	close = mock(async () => {});
}

class MockQueueEvents {
	on(_event: string, _handler: (...args: unknown[]) => void) {}
	waitUntilReady = mock(async () => {});
	close = mock(async () => {});
}

mock.module("@api/db/queries/knowledge", () => ({
	deleteKnowledgeByLinkSource: deleteKnowledgeByLinkSourceMock,
	upsertKnowledge: upsertKnowledgeMock,
}));

mock.module("@api/db/queries/link-source", () => ({
	getLinkSourceById: getLinkSourceByIdMock,
	getLinkSourceTotalSize: getLinkSourceTotalSizeMock,
	updateLinkSource: updateLinkSourceMock,
}));

mock.module("@api/db/queries/website", () => ({
	getWebsiteById: getWebsiteByIdMock,
}));

mock.module("@api/lib/plans/access", () => ({
	getPlanForWebsite: getPlanForWebsiteMock,
}));

mock.module("@api/services/firecrawl", () => ({
	FirecrawlService: MockFirecrawlService,
}));

mock.module("@plasma/jobs", () => ({
	QUEUE_NAMES: {
		WEB_CRAWL: "web-crawl",
	},
}));

mock.module("@plasma/redis", () => ({
	getSafeRedisUrl: () => "redis://masked",
	createRedisConnection: () => ({
		eval: mock(async () => 0),
		quit: mock(async () => {}),
	}),
}));

mock.module("@workers/db", () => ({
	db: {},
}));

mock.module("@workers/env", () => ({
	env: {
		FIRECRAWL_API_KEY: "test-firecrawl-key",
		WEB_CRAWL_GLOBAL_ACTIVE_LIMIT: 3,
		WEB_CRAWL_MAX_CONCURRENCY_PER_CRAWL: 15,
		WEB_CRAWL_SLOT_TTL_MS: 2_100_000,
		WEB_CRAWL_BUDGET_REQUEUE_DELAY_MS: 15_000,
		WEB_CRAWL_BUDGET_REQUEUE_JITTER_MS: 5000,
	},
}));

mock.module("@workers/realtime", () => ({
	emitToWebsite: emitToWebsiteMock,
}));

mock.module("bullmq", () => ({
	DelayedError: MockDelayedError,
	Worker: MockWorker,
	Queue: MockQueue,
	QueueEvents: MockQueueEvents,
}));

mock.module("drizzle-orm", () => ({
	and: (...conditions: unknown[]) => ({
		type: "and",
		conditions,
	}),
	eq: (left: unknown, right: unknown) => ({
		type: "eq",
		left,
		right,
	}),
	isNull: (value: unknown) => ({
		type: "isNull",
		value,
	}),
}));

const modulePromise = import("./worker");

const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

function buildLinkSource(
	overrides: Partial<MockLinkSource> = {}
): MockLinkSource {
	return {
		id: "link-source-1",
		websiteId: "site-1",
		status: "pending",
		includePaths: null,
		excludePaths: null,
		ignoredUrls: null,
		discoveredPagesCount: 0,
		crawledPagesCount: 0,
		totalSizeBytes: 0,
		firecrawlJobId: null,
		deletedAt: null,
		errorMessage: null,
		...overrides,
	};
}

function buildJobData(
	overrides: Partial<WebCrawlJobData> = {}
): WebCrawlJobData {
	return {
		linkSourceId: "link-source-1",
		websiteId: "site-1",
		organizationId: "org-1",
		aiAgentId: "ai-1",
		url: "https://example.com",
		crawlLimit: 1000,
		createdBy: "user-1",
		includePaths: null,
		excludePaths: null,
		maxDepth: 1,
		...overrides,
	};
}

function buildPage(path: string, title = path): MockCrawlPage {
	return {
		url: `https://example.com${path}`,
		title,
		markdown: `# ${title}\n\ncontent`,
		sizeBytes: 128,
	};
}

function setCrawlStatuses(statuses: MockCrawlStatus[]): void {
	crawlStatusSequence = statuses.map((status) => ({
		...status,
		progress: status.progress ? { ...status.progress } : undefined,
		pages: status.pages ? [...status.pages] : undefined,
	}));
	crawlStatusFallback =
		crawlStatusSequence[crawlStatusSequence.length - 1] ?? null;
}

function createRuntime(overrides: Partial<Record<string, number>> = {}) {
	let nowMs = 0;

	return {
		runtime: {
			now: () => nowMs,
			sleep: async (ms: number) => {
				nowMs += ms;
			},
			random: () => 0,
			pollIntervalMs: overrides.pollIntervalMs ?? 5000,
			maxPollAttempts: overrides.maxPollAttempts ?? 360,
			stallThresholdMs: overrides.stallThresholdMs ?? 60_000,
			linkSourceCheckIntervalPolls: overrides.linkSourceCheckIntervalPolls ?? 3,
			progressLogIntervalPolls: overrides.progressLogIntervalPolls ?? 10,
			maxFirecrawlConcurrency: overrides.maxFirecrawlConcurrency ?? 15,
			budgetRequeueDelayMs: overrides.budgetRequeueDelayMs ?? 15_000,
			budgetRequeueJitterMs: overrides.budgetRequeueJitterMs ?? 5000,
		},
		getNowMs: () => nowMs,
		advanceBy: (ms: number) => {
			nowMs += ms;
		},
	};
}

function createJob(data: WebCrawlJobData = buildJobData()) {
	progressCalls.length = 0;
	jobCounter += 1;
	const jobId = `queue-job-${jobCounter}`;

	return {
		id: jobId,
		data,
		updateProgress: mock(async (value: number) => {
			progressCalls.push(value);
		}),
		moveToDelayed: mock(async (timestamp: number, token: string) => {
			delayedCalls.push({
				jobId,
				timestamp,
				token,
			});
			operationLog.push("moveToDelayed");
		}),
	};
}

function createTestSlotManager(params: {
	now: () => number;
	slotCount?: number;
	ttlMs?: number;
}) {
	const slotCount = params.slotCount ?? 3;
	const ttlMs = params.ttlMs ?? 2_100_000;
	const slotKeys = Array.from(
		{ length: slotCount },
		(_, index) => `test-slot:${index + 1}`
	);
	const slots = new Map<string, { token: string; expiresAt: number }>();
	let leaseCounter = 0;

	const cleanupExpired = () => {
		const now = params.now();
		for (const [key, slot] of slots.entries()) {
			if (slot.expiresAt <= now) {
				slots.delete(key);
			}
		}
	};

	const manager = {
		acquire: mock(
			async (context: { jobId: string; linkSourceId: string; url: string }) => {
				cleanupExpired();
				for (const [index, key] of slotKeys.entries()) {
					if (slots.has(key)) {
						continue;
					}

					leaseCounter += 1;
					const token = `${context.jobId}:${leaseCounter}`;
					slots.set(key, {
						token,
						expiresAt: params.now() + ttlMs,
					});
					return {
						...context,
						key,
						slotIndex: index + 1,
						token,
						acquiredAt: params.now(),
					};
				}

				return null;
			}
		),
		renew: mock(async (lease: { key: string; token: string }) => {
			cleanupExpired();
			const current = slots.get(lease.key);
			if (!current || current.token !== lease.token) {
				return false;
			}

			slots.set(lease.key, {
				token: current.token,
				expiresAt: params.now() + ttlMs,
			});
			return true;
		}),
		release: mock(async (lease: { key: string; token: string }) => {
			cleanupExpired();
			const current = slots.get(lease.key);
			if (!current || current.token !== lease.token) {
				return false;
			}

			slots.delete(lease.key);
			return true;
		}),
	};

	return {
		manager,
		getActiveCount: () => {
			cleanupExpired();
			return slots.size;
		},
	};
}

type ProcessWebCrawlJobFn = Awaited<typeof modulePromise>["processWebCrawlJob"];
type RuntimeContext = ReturnType<typeof createRuntime>;
type TestSlotManager = ReturnType<typeof createTestSlotManager>;

async function runProcessWebCrawlJob(
	processWebCrawlJob: ProcessWebCrawlJobFn,
	params: {
		firecrawlService?: MockFirecrawlService;
		job?: ReturnType<typeof createJob>;
		runtimeContext?: RuntimeContext;
		slotManager?: TestSlotManager["manager"];
		token?: string;
	} = {}
) {
	const firecrawlService =
		params.firecrawlService ?? new MockFirecrawlService();
	const job = params.job ?? createJob();
	const runtimeContext = params.runtimeContext ?? createRuntime();
	const slotManager =
		params.slotManager ??
		createTestSlotManager({
			now: runtimeContext.runtime.now,
		}).manager;

	await processWebCrawlJob(firecrawlService, job as never, {
		runtime: runtimeContext.runtime,
		token: params.token ?? "test-token",
		slotManager,
	});

	return {
		firecrawlService,
		job,
		runtimeContext,
		slotManager,
	};
}

beforeEach(() => {
	updateLinkSourceEvents.length = 0;
	realtimeEvents.length = 0;
	statusRequests.length = 0;
	progressCalls.length = 0;
	operationLog.length = 0;
	startCrawlCalls.length = 0;
	delayedCalls.length = 0;
	knowledgeIdCounter = 0;
	jobCounter = 0;
	linkSourceState = buildLinkSource();
	crawlStatusSequence = [];
	crawlStatusFallback = null;

	getLinkSourceByIdMock.mockReset();
	getLinkSourceByIdMock.mockImplementation(async () => {
		if (!linkSourceState) {
			return null;
		}

		return { ...linkSourceState };
	});

	updateLinkSourceMock.mockReset();
	updateLinkSourceMock.mockImplementation(
		async (_db: unknown, params: Record<string, unknown>) => {
			updateLinkSourceEvents.push(params);
			if (params.status === "failed") {
				operationLog.push("update:failed");
			}

			if (!linkSourceState) {
				return null;
			}

			linkSourceState = {
				...linkSourceState,
				...params,
			} as MockLinkSource;

			return { ...linkSourceState };
		}
	);

	getLinkSourceTotalSizeMock.mockReset();
	getLinkSourceTotalSizeMock.mockResolvedValue(0);
	deleteKnowledgeByLinkSourceMock.mockReset();
	deleteKnowledgeByLinkSourceMock.mockResolvedValue(0);
	upsertKnowledgeMock.mockReset();
	upsertKnowledgeMock.mockImplementation(async () => {
		knowledgeIdCounter += 1;
		return { id: `knowledge-${knowledgeIdCounter}` };
	});
	getWebsiteByIdMock.mockReset();
	getWebsiteByIdMock.mockResolvedValue({
		id: "site-1",
		organizationId: "org-1",
	});
	getPlanForWebsiteMock.mockReset();
	getPlanForWebsiteMock.mockResolvedValue({
		features: {
			"ai-agent-training-mb": null,
		},
	});
	emitToWebsiteMock.mockReset();
	emitToWebsiteMock.mockImplementation(
		async (
			_websiteId: string,
			event: string,
			payload: Record<string, unknown>
		) => {
			realtimeEvents.push({ event, payload });
		}
	);

	isConfiguredMock.mockReset();
	isConfiguredMock.mockReturnValue(true);
	startCrawlMock.mockReset();
	startCrawlMock.mockImplementation(
		async (url: string, options?: Record<string, unknown>) => {
			startCrawlCalls.push({
				url,
				options: options ?? {},
			});
			operationLog.push("startCrawl");
			return {
				success: true,
				jobId: "fc-job-1",
			};
		}
	);
	getCrawlStatusMock.mockReset();
	getCrawlStatusMock.mockImplementation(
		async (jobId: string, options?: { includeAllPages?: boolean }) => {
			statusRequests.push({ jobId, options });

			if (crawlStatusSequence.length > 0) {
				const nextStatus = crawlStatusSequence.shift();
				if (nextStatus) {
					return nextStatus;
				}
			}

			if (!crawlStatusFallback) {
				throw new Error("No crawl status configured for test");
			}

			return crawlStatusFallback;
		}
	);
	cancelCrawlMock.mockReset();
	cancelCrawlMock.mockImplementation(async () => {
		operationLog.push("cancelCrawl");
		return { success: true };
	});
	getCrawlErrorsMock.mockReset();
	getCrawlErrorsMock.mockResolvedValue({
		success: true,
		errors: [],
	});

	console.log = mock(() => {}) as typeof console.log;
	console.warn = mock(() => {}) as typeof console.warn;
	console.error = mock(() => {}) as typeof console.error;
});

afterEach(() => {
	console.log = originalConsoleLog;
	console.warn = originalConsoleWarn;
	console.error = originalConsoleError;
});

describe("web crawl worker", () => {
	it("keeps polling when Firecrawl starts in pending instead of completing empty", async () => {
		const { processWebCrawlJob } = await modulePromise;
		const firecrawlService = new MockFirecrawlService();
		const job = createJob();
		const runtimeContext = createRuntime();
		const slotState = createTestSlotManager({
			now: runtimeContext.runtime.now,
		});
		const page = buildPage("/docs");

		setCrawlStatuses([
			{
				status: "pending",
				rawStatus: "queued",
			},
			{
				status: "completed",
				rawStatus: "completed",
				progress: {
					completed: 1,
					total: 1,
				},
				pages: [page],
			},
			{
				status: "completed",
				rawStatus: "completed",
				progress: {
					completed: 1,
					total: 1,
				},
				pages: [page],
			},
		]);

		await runProcessWebCrawlJob(processWebCrawlJob, {
			firecrawlService,
			job,
			runtimeContext,
			slotManager: slotState.manager,
		});

		expect(statusRequests).toHaveLength(3);
		expect(statusRequests[0]?.options).toEqual({});
		expect(statusRequests[2]?.options).toEqual({ includeAllPages: true });
		expect(startCrawlCalls[0]?.options.maxConcurrency).toBe(15);
		expect(deleteKnowledgeByLinkSourceMock).toHaveBeenCalledWith(
			expect.anything(),
			{
				linkSourceId: "link-source-1",
				websiteId: "site-1",
			}
		);
		expect(upsertKnowledgeMock).toHaveBeenCalledTimes(1);
		expect(slotState.getActiveCount()).toBe(0);

		const completedEvent = realtimeEvents.find(
			(entry) => entry.event === "crawlCompleted"
		);
		expect(completedEvent?.payload.crawledPagesCount).toBe(1);
	});

	it("re-delays the fourth crawl when the global slot budget is already exhausted", async () => {
		const { processWebCrawlJob } = await modulePromise;
		const runtimeContext = createRuntime();
		const slotState = createTestSlotManager({
			now: runtimeContext.runtime.now,
		});
		const job = createJob(
			buildJobData({
				linkSourceId: "link-source-4",
			})
		);

		await slotState.manager.acquire({
			jobId: "held-job-1",
			linkSourceId: "held-link-source-1",
			url: "https://example.com/held-1",
		});
		await slotState.manager.acquire({
			jobId: "held-job-2",
			linkSourceId: "held-link-source-2",
			url: "https://example.com/held-2",
		});
		await slotState.manager.acquire({
			jobId: "held-job-3",
			linkSourceId: "held-link-source-3",
			url: "https://example.com/held-3",
		});

		let delayedError: unknown;
		try {
			await runProcessWebCrawlJob(processWebCrawlJob, {
				job,
				runtimeContext,
				slotManager: slotState.manager,
				token: "budget-token",
			});
		} catch (error) {
			delayedError = error;
		}

		expect(delayedError).toBeInstanceOf(MockDelayedError);
		expect(startCrawlMock).toHaveBeenCalledTimes(0);
		expect(delayedCalls).toHaveLength(1);
		expect(delayedCalls[0]?.token).toBe("budget-token");
		expect(linkSourceState?.status).toBe("pending");
		expect(
			updateLinkSourceEvents.some(
				(entry) => entry.status === "crawling" || entry.status === "failed"
			)
		).toBe(false);
		expect(slotState.getActiveCount()).toBe(3);
	});

	it("recovers when expired leases free the global crawl budget", async () => {
		const { processWebCrawlJob } = await modulePromise;
		const runtimeContext = createRuntime();
		const slotState = createTestSlotManager({
			now: runtimeContext.runtime.now,
			ttlMs: 10_000,
		});
		const page = buildPage("/docs");

		await slotState.manager.acquire({
			jobId: "stale-job-1",
			linkSourceId: "stale-link-source-1",
			url: "https://example.com/stale-1",
		});
		await slotState.manager.acquire({
			jobId: "stale-job-2",
			linkSourceId: "stale-link-source-2",
			url: "https://example.com/stale-2",
		});
		await slotState.manager.acquire({
			jobId: "stale-job-3",
			linkSourceId: "stale-link-source-3",
			url: "https://example.com/stale-3",
		});

		runtimeContext.advanceBy(10_001);
		setCrawlStatuses([
			{
				status: "completed",
				rawStatus: "completed",
				progress: {
					completed: 1,
					total: 1,
				},
				pages: [page],
			},
			{
				status: "completed",
				rawStatus: "completed",
				progress: {
					completed: 1,
					total: 1,
				},
				pages: [page],
			},
		]);

		await runProcessWebCrawlJob(processWebCrawlJob, {
			runtimeContext,
			slotManager: slotState.manager,
		});

		expect(startCrawlCalls).toHaveLength(1);
		expect(delayedCalls).toHaveLength(0);
		expect(slotState.getActiveCount()).toBe(0);
	});

	it("re-delays retryable Firecrawl start failures without marking the source failed", async () => {
		const { processWebCrawlJob } = await modulePromise;
		const runtimeContext = createRuntime();
		const slotState = createTestSlotManager({
			now: runtimeContext.runtime.now,
		});

		startCrawlMock.mockImplementationOnce(
			async () =>
				({
					success: false,
					error: "Firecrawl API error: 429 Too Many Requests",
					statusCode: 429,
					retryable: true,
				}) as never
		);

		let delayedError: unknown;
		try {
			await runProcessWebCrawlJob(processWebCrawlJob, {
				runtimeContext,
				slotManager: slotState.manager,
				token: "retry-token",
			});
		} catch (error) {
			delayedError = error;
		}

		expect(delayedError).toBeInstanceOf(MockDelayedError);
		expect(delayedCalls).toHaveLength(1);
		expect(linkSourceState?.status).toBe("pending");
		expect(
			updateLinkSourceEvents.some((entry) => entry.status === "failed")
		).toBe(false);
		expect(slotState.getActiveCount()).toBe(0);
	});

	it("keeps polling through retryable Firecrawl status failures", async () => {
		const { processWebCrawlJob } = await modulePromise;
		const runtimeContext = createRuntime();
		const slotState = createTestSlotManager({
			now: runtimeContext.runtime.now,
		});
		const page = buildPage("/docs");

		setCrawlStatuses([
			{
				status: "failed",
				error: "Firecrawl API error: 503 Service Unavailable",
				statusCode: 503,
				retryable: true,
			},
			{
				status: "completed",
				rawStatus: "completed",
				progress: {
					completed: 1,
					total: 1,
				},
				pages: [page],
			},
			{
				status: "completed",
				rawStatus: "completed",
				progress: {
					completed: 1,
					total: 1,
				},
				pages: [page],
			},
		]);

		await runProcessWebCrawlJob(processWebCrawlJob, {
			runtimeContext,
			slotManager: slotState.manager,
		});

		expect(statusRequests).toHaveLength(3);
		expect(
			updateLinkSourceEvents.some((entry) => entry.status === "failed")
		).toBe(false);
		expect(upsertKnowledgeMock).toHaveBeenCalledTimes(1);
		expect(slotState.getActiveCount()).toBe(0);
	});

	it("fails stalled crawls after 60 seconds and cancels the remote job", async () => {
		const { processWebCrawlJob } = await modulePromise;
		const firecrawlService = new MockFirecrawlService();
		const job = createJob();
		const runtimeContext = createRuntime();
		const slotState = createTestSlotManager({
			now: runtimeContext.runtime.now,
		});
		const pages = Array.from({ length: 48 }, (_, index) =>
			buildPage(`/page-${index + 1}`, `Page ${index + 1}`)
		);

		setCrawlStatuses(
			Array.from({ length: 14 }, () => ({
				status: "crawling",
				rawStatus: "scraping",
				progress: {
					completed: 48,
					total: 100,
				},
				pages,
			}))
		);

		await expect(
			runProcessWebCrawlJob(processWebCrawlJob, {
				firecrawlService,
				job,
				runtimeContext,
				slotManager: slotState.manager,
			})
		).rejects.toThrow("Crawl stalled with no progress for 60s");

		expect(cancelCrawlMock).toHaveBeenCalledTimes(1);
		expect(getCrawlErrorsMock).toHaveBeenCalledTimes(0);
		expect(slotState.getActiveCount()).toBe(0);

		const failedUpdates = updateLinkSourceEvents.filter(
			(entry) => entry.status === "failed"
		);
		expect(failedUpdates).toHaveLength(1);
		expect(failedUpdates[0]?.errorMessage).toBe(
			"Crawl stalled with no progress for 60s"
		);

		const failedEvents = realtimeEvents.filter(
			(entry) => entry.event === "crawlFailed"
		);
		expect(failedEvents).toHaveLength(1);
	});

	it("completes early when Firecrawl reports completed totals but never flips terminal", async () => {
		const { processWebCrawlJob } = await modulePromise;
		const firecrawlService = new MockFirecrawlService();
		const job = createJob();
		const runtimeContext = createRuntime();
		const slotState = createTestSlotManager({
			now: runtimeContext.runtime.now,
		});
		const pageOne = buildPage("/docs");
		const pageTwo = buildPage("/blog");

		setCrawlStatuses([
			{
				status: "crawling",
				rawStatus: "scraping",
				progress: {
					completed: 2,
					total: 2,
				},
				pages: [pageOne],
			},
			{
				status: "crawling",
				rawStatus: "scraping",
				progress: {
					completed: 2,
					total: 2,
				},
				pages: [pageOne],
			},
			{
				status: "crawling",
				rawStatus: "scraping",
				progress: {
					completed: 2,
					total: 2,
				},
				pages: [pageOne, pageTwo],
			},
		]);

		await runProcessWebCrawlJob(processWebCrawlJob, {
			firecrawlService,
			job,
			runtimeContext,
			slotManager: slotState.manager,
		});

		expect(
			statusRequests.some(
				(request) => request.options?.includeAllPages === true
			)
		).toBe(true);
		expect(cancelCrawlMock).toHaveBeenCalledTimes(1);
		expect(upsertKnowledgeMock).toHaveBeenCalledTimes(2);
		expect(slotState.getActiveCount()).toBe(0);

		const completedEvent = realtimeEvents.find(
			(entry) => entry.event === "crawlCompleted"
		);
		expect(completedEvent?.payload.crawledPagesCount).toBe(2);
	});

	it("finalizes stalled near-complete crawls when Firecrawl pagination truncates", async () => {
		const { processWebCrawlJob } = await modulePromise;
		const firecrawlService = new MockFirecrawlService();
		const job = createJob();
		const runtimeContext = createRuntime();
		const slotState = createTestSlotManager({
			now: runtimeContext.runtime.now,
		});
		const pages = Array.from({ length: 48 }, (_, index) =>
			buildPage(`/page-${index + 1}`, `Page ${index + 1}`)
		);

		setCrawlStatuses([
			...Array.from({ length: 13 }, () => ({
				status: "crawling" as const,
				rawStatus: "scraping",
				progress: {
					completed: 48,
					total: 54,
				},
				pages,
			})),
			{
				status: "crawling",
				rawStatus: "scraping",
				progress: {
					completed: 48,
					total: 54,
				},
				materializedPageCount: 48,
				paginationTruncated: true,
				pages,
			},
		]);

		await runProcessWebCrawlJob(processWebCrawlJob, {
			firecrawlService,
			job,
			runtimeContext,
			slotManager: slotState.manager,
		});

		expect(cancelCrawlMock).toHaveBeenCalledTimes(1);
		expect(
			updateLinkSourceEvents.some((entry) => entry.status === "failed")
		).toBe(false);
		expect(upsertKnowledgeMock).toHaveBeenCalledTimes(48);
		expect(slotState.getActiveCount()).toBe(0);

		const completedUpdate = [...updateLinkSourceEvents]
			.reverse()
			.find((entry) => entry.status === "completed");
		expect(completedUpdate?.crawledPagesCount).toBe(48);
	});

	it("cancels the remote crawl before marking the source failed on timeout", async () => {
		const { processWebCrawlJob } = await modulePromise;
		const firecrawlService = new MockFirecrawlService();
		const job = createJob();
		const runtimeContext = createRuntime({
			maxPollAttempts: 2,
			stallThresholdMs: 120_000,
		});
		const slotState = createTestSlotManager({
			now: runtimeContext.runtime.now,
		});

		setCrawlStatuses([
			{
				status: "crawling",
				rawStatus: "scraping",
				progress: {
					completed: 1,
					total: 10,
				},
			},
			{
				status: "crawling",
				rawStatus: "scraping",
				progress: {
					completed: 1,
					total: 10,
				},
			},
			{
				status: "crawling",
				rawStatus: "scraping",
				progress: {
					completed: 1,
					total: 10,
				},
			},
		]);

		await expect(
			runProcessWebCrawlJob(processWebCrawlJob, {
				firecrawlService,
				job,
				runtimeContext,
				slotManager: slotState.manager,
			})
		).rejects.toThrow("Crawl timed out after 30 minutes");

		const cancelIndex = operationLog.indexOf("cancelCrawl");
		const failedIndex = operationLog.indexOf("update:failed");
		expect(cancelIndex).toBeGreaterThanOrEqual(0);
		expect(failedIndex).toBeGreaterThanOrEqual(0);
		expect(cancelIndex).toBeLessThan(failedIndex);
		expect(slotState.getActiveCount()).toBe(0);
	});

	it("releases the crawl slot when Firecrawl reports a non-retryable failure", async () => {
		const { processWebCrawlJob } = await modulePromise;
		const runtimeContext = createRuntime();
		const slotState = createTestSlotManager({
			now: runtimeContext.runtime.now,
		});

		setCrawlStatuses([
			{
				status: "failed",
				rawStatus: "failed",
				error: "Crawl failed upstream",
			},
		]);

		await expect(
			runProcessWebCrawlJob(processWebCrawlJob, {
				runtimeContext,
				slotManager: slotState.manager,
			})
		).rejects.toThrow("Crawl failed upstream");

		expect(getCrawlErrorsMock).toHaveBeenCalledTimes(1);
		expect(slotState.getActiveCount()).toBe(0);
	});

	it("releases the crawl slot when the link source is deleted mid-crawl", async () => {
		const { processWebCrawlJob } = await modulePromise;
		const runtimeContext = createRuntime({
			linkSourceCheckIntervalPolls: 1,
		});
		const slotState = createTestSlotManager({
			now: runtimeContext.runtime.now,
		});
		let lookupCount = 0;

		getLinkSourceByIdMock.mockImplementation(async () => {
			lookupCount++;
			if (lookupCount === 1) {
				return buildLinkSource();
			}

			return null;
		});

		setCrawlStatuses([
			{
				status: "crawling",
				rawStatus: "scraping",
				progress: {
					completed: 1,
					total: 10,
				},
			},
		]);

		await runProcessWebCrawlJob(processWebCrawlJob, {
			runtimeContext,
			slotManager: slotState.manager,
		});

		expect(cancelCrawlMock).toHaveBeenCalledTimes(1);
		expect(slotState.getActiveCount()).toBe(0);
	});

	it("releases the crawl slot when the link source is cancelled mid-crawl", async () => {
		const { processWebCrawlJob } = await modulePromise;
		const runtimeContext = createRuntime({
			linkSourceCheckIntervalPolls: 1,
		});
		const slotState = createTestSlotManager({
			now: runtimeContext.runtime.now,
		});
		let lookupCount = 0;

		getLinkSourceByIdMock.mockImplementation(async () => {
			lookupCount++;
			if (lookupCount === 1) {
				return buildLinkSource();
			}

			return buildLinkSource({
				status: "failed",
				firecrawlJobId: "fc-job-1",
				errorMessage: "Cancelled by user",
			});
		});

		setCrawlStatuses([
			{
				status: "crawling",
				rawStatus: "scraping",
				progress: {
					completed: 1,
					total: 10,
				},
			},
		]);

		await runProcessWebCrawlJob(processWebCrawlJob, {
			runtimeContext,
			slotManager: slotState.manager,
		});

		expect(cancelCrawlMock).toHaveBeenCalledTimes(1);
		expect(slotState.getActiveCount()).toBe(0);
	});

	it("only performs poll-loop writes when values change", async () => {
		const { processWebCrawlJob } = await modulePromise;
		const firecrawlService = new MockFirecrawlService();
		const job = createJob();
		const runtimeContext = createRuntime();
		const slotState = createTestSlotManager({
			now: runtimeContext.runtime.now,
		});
		const page = buildPage("/docs");

		setCrawlStatuses([
			{
				status: "crawling",
				rawStatus: "scraping",
				progress: {
					completed: 1,
					total: 10,
				},
			},
			{
				status: "crawling",
				rawStatus: "scraping",
				progress: {
					completed: 1,
					total: 10,
				},
			},
			{
				status: "crawling",
				rawStatus: "scraping",
				progress: {
					completed: 1,
					total: 10,
				},
			},
			{
				status: "completed",
				rawStatus: "completed",
				progress: {
					completed: 10,
					total: 10,
				},
				pages: [page],
			},
			{
				status: "completed",
				rawStatus: "completed",
				progress: {
					completed: 10,
					total: 10,
				},
				pages: [page],
			},
		]);

		await runProcessWebCrawlJob(processWebCrawlJob, {
			firecrawlService,
			job,
			runtimeContext,
			slotManager: slotState.manager,
		});

		expect(progressCalls.filter((value) => value === 17)).toHaveLength(1);
		expect(
			updateLinkSourceEvents.filter(
				(entry) => entry.discoveredPagesCount === 10
			)
		).toHaveLength(1);
		expect(slotState.getActiveCount()).toBe(0);
	});
});
