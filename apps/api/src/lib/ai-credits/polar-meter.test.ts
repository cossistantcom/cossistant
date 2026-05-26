import { beforeEach, describe, expect, it, mock } from "bun:test";
import {
	getAiCreditMeterState,
	grantAiCreditUsage,
	ingestAiCreditUsage,
} from "./polar-meter";

class FakeRedis {
	store = new Map<string, string>();

	async get(key: string): Promise<string | null> {
		return this.store.get(key) ?? null;
	}

	async set(
		key: string,
		value: string,
		...args: Array<string | number>
	): Promise<string | null> {
		const hasNx = args.includes("NX");
		if (hasNx && this.store.has(key)) {
			return null;
		}

		this.store.set(key, value);
		return "OK";
	}

	async del(...keys: string[]): Promise<number> {
		let deleted = 0;
		for (const key of keys) {
			if (this.store.delete(key)) {
				deleted++;
			}
		}
		return deleted;
	}
}

function buildCachedMeterState(params: {
	organizationId: string;
	lastSyncedAt: string;
	outage?: boolean;
	balance?: number | null;
}): string {
	return JSON.stringify({
		organizationId: params.organizationId,
		meterId: "meter-ai-1",
		balance: params.balance ?? 25,
		consumedUnits: 10,
		creditedUnits: 35,
		meterBacked: true,
		lastSyncedAt: params.lastSyncedAt,
		outage: params.outage === true,
	});
}

describe("ai credit Polar meter gateway", () => {
	let redis: FakeRedis;
	let polar: {
		customers: {
			getStateExternal: ReturnType<typeof mock>;
		};
		events: {
			ingest: ReturnType<typeof mock>;
		};
	};
	let nowMs: number;

	beforeEach(() => {
		redis = new FakeRedis();
		nowMs = Date.parse("2026-02-18T15:00:00.000Z");
		polar = {
			customers: {
				getStateExternal: mock(async () => ({
					activeMeters: [
						{
							meterId: "meter-ai-1",
							balance: 42,
							consumedUnits: 58,
							creditedUnits: 100,
						},
					],
				})),
			},
			events: {
				ingest: mock(async () => ({})),
			},
		};
	});

	it("returns cache hit without calling Polar when cache is fresh", async () => {
		await redis.set(
			"ai-credit:meter:org-1",
			buildCachedMeterState({
				organizationId: "org-1",
				lastSyncedAt: new Date(nowMs - 5000).toISOString(),
				balance: 19,
			})
		);

		const result = await getAiCreditMeterState("org-1", {
			deps: {
				redis,
				polar,
				now: () => nowMs,
				meterId: "meter-ai-1",
				cacheTtlSeconds: 15,
				staleTtlSeconds: 300,
			},
		});

		expect(result.source).toBe("cache");
		expect(result.balance).toBe(19);
		expect(polar.customers.getStateExternal).not.toHaveBeenCalled();
	});

	it("returns a disabled state when Polar billing is turned off", async () => {
		const result = await getAiCreditMeterState("org-1", {
			deps: {
				redis,
				polar,
				now: () => nowMs,
				billingEnabled: false,
				meterId: "meter-ai-1",
				cacheTtlSeconds: 15,
				staleTtlSeconds: 300,
			},
		});

		expect(result.source).toBe("disabled");
		expect(result.outage).toBe(false);
		expect(result.meterBacked).toBe(false);
		expect(polar.customers.getStateExternal).not.toHaveBeenCalled();
	});

	it("returns stale cache when lock is contended", async () => {
		await redis.set(
			"ai-credit:meter:org-1",
			buildCachedMeterState({
				organizationId: "org-1",
				lastSyncedAt: new Date(nowMs - 40_000).toISOString(),
				balance: 17,
			})
		);
		await redis.set("ai-credit:meter-lock:org-1", "someone-else");

		const result = await getAiCreditMeterState("org-1", {
			deps: {
				redis,
				polar,
				now: () => nowMs,
				meterId: "meter-ai-1",
				cacheTtlSeconds: 15,
				staleTtlSeconds: 300,
			},
		});

		expect(result.source).toBe("stale_cache");
		expect(result.balance).toBe(17);
		expect(polar.customers.getStateExternal).not.toHaveBeenCalled();
	});

	it("falls back to stale cache when Polar request fails", async () => {
		await redis.set(
			"ai-credit:meter:org-1",
			buildCachedMeterState({
				organizationId: "org-1",
				lastSyncedAt: new Date(nowMs - 20_000).toISOString(),
				balance: 11,
			})
		);
		polar.customers.getStateExternal.mockImplementation(async () => {
			throw new Error("polar unavailable");
		});

		const result = await getAiCreditMeterState("org-1", {
			deps: {
				redis,
				polar,
				now: () => nowMs,
				meterId: "meter-ai-1",
				cacheTtlSeconds: 15,
				staleTtlSeconds: 300,
			},
		});

		expect(result.source).toBe("stale_cache");
		expect(result.balance).toBe(11);
	});

	it("optimistically updates cached balance after usage ingest", async () => {
		await redis.set(
			"ai-credit:meter:org-1",
			buildCachedMeterState({
				organizationId: "org-1",
				lastSyncedAt: new Date(nowMs - 5000).toISOString(),
				balance: 10,
			})
		);

		const ingestResult = await ingestAiCreditUsage(
			{
				organizationId: "org-1",
				credits: 2.5,
				workflowRunId: "wf-1",
				modelId: "moonshotai/kimi-k2.5",
				mode: "normal",
				baseCredits: 1,
				modelCredits: 0,
				thinkingCredits: 0,
				toolCredits: 1.5,
				billableToolCount: 5,
				excludedToolCount: 1,
				totalToolCount: 6,
			},
			{
				deps: {
					redis,
					polar,
					now: () => nowMs,
					meterId: "meter-ai-1",
					eventName: "ai_usage",
					cacheTtlSeconds: 15,
					staleTtlSeconds: 300,
					ingestBackoffSeconds: 30,
				},
			}
		);

		expect(ingestResult.status).toBe("ingested");
		expect(polar.events.ingest).toHaveBeenCalledTimes(1);

		const updatedCacheRaw = await redis.get("ai-credit:meter:org-1");
		const updatedCache = updatedCacheRaw ? JSON.parse(updatedCacheRaw) : null;
		expect(updatedCache?.balance).toBe(7.5);
		expect(updatedCache?.consumedUnits).toBe(12.5);
	});

	it("ingests negative credits and optimistically updates cached balance after admin grant", async () => {
		await redis.set(
			"ai-credit:meter:org-1",
			buildCachedMeterState({
				organizationId: "org-1",
				lastSyncedAt: new Date(nowMs - 5000).toISOString(),
				balance: 10,
			})
		);

		const grantResult = await grantAiCreditUsage(
			{
				organizationId: "org-1",
				websiteId: "site-1",
				amount: 7.5,
				adminUserId: "admin-1",
			},
			{
				deps: {
					redis,
					polar,
					now: () => nowMs,
					meterId: "meter-ai-1",
					eventName: "ai_usage",
					cacheTtlSeconds: 15,
					staleTtlSeconds: 300,
				},
			}
		);

		expect(grantResult.status).toBe("ingested");
		expect(polar.events.ingest).toHaveBeenCalledWith({
			events: [
				{
					name: "ai_usage",
					externalCustomerId: "org-1",
					metadata: {
						credits: -7.5,
						websiteId: "site-1",
						organizationId: "org-1",
						adminUserId: "admin-1",
						kind: "admin_grant",
					},
				},
			],
		});

		const updatedCacheRaw = await redis.get("ai-credit:meter:org-1");
		const updatedCache = updatedCacheRaw ? JSON.parse(updatedCacheRaw) : null;
		expect(updatedCache?.balance).toBe(17.5);
		expect(updatedCache?.creditedUnits).toBe(42.5);
		expect(updatedCache?.consumedUnits).toBe(10);
	});

	it("skips ingest while backoff cooldown is active", async () => {
		await redis.set("ai-credit:ingest-backoff:org-1", "active-backoff");

		const result = await ingestAiCreditUsage(
			{
				organizationId: "org-1",
				credits: 1,
				workflowRunId: "wf-2",
				modelId: "moonshotai/kimi-k2.5",
				mode: "normal",
				baseCredits: 1,
				modelCredits: 0,
				thinkingCredits: 0,
				toolCredits: 0,
				billableToolCount: 0,
				excludedToolCount: 0,
				totalToolCount: 0,
			},
			{
				deps: {
					redis,
					polar,
					now: () => nowMs,
					meterId: "meter-ai-1",
					eventName: "ai_usage",
					cacheTtlSeconds: 15,
					staleTtlSeconds: 300,
					ingestBackoffSeconds: 30,
				},
			}
		);

		expect(result.status).toBe("skipped_backoff");
		expect(polar.events.ingest).not.toHaveBeenCalled();
	});

	it("returns failed and sets backoff key when ingest fails", async () => {
		polar.events.ingest.mockImplementation(async () => {
			throw new Error("ingest failure");
		});

		const result = await ingestAiCreditUsage(
			{
				organizationId: "org-1",
				credits: 1,
				workflowRunId: "wf-3",
				modelId: "moonshotai/kimi-k2.5",
				mode: "normal",
				baseCredits: 1,
				modelCredits: 0,
				thinkingCredits: 0,
				toolCredits: 0,
				billableToolCount: 0,
				excludedToolCount: 0,
				totalToolCount: 0,
			},
			{
				deps: {
					redis,
					polar,
					now: () => nowMs,
					meterId: "meter-ai-1",
					eventName: "ai_usage",
					cacheTtlSeconds: 15,
					staleTtlSeconds: 300,
					ingestBackoffSeconds: 30,
				},
			}
		);

		expect(result.status).toBe("failed");
		expect(await redis.get("ai-credit:ingest-backoff:org-1")).toBeTruthy();
	});

	it("skips ingest entirely when billing is disabled", async () => {
		const result = await ingestAiCreditUsage(
			{
				organizationId: "org-1",
				credits: 1,
				workflowRunId: "wf-disabled",
				modelId: "moonshotai/kimi-k2.5",
				mode: "normal",
				baseCredits: 1,
				modelCredits: 0,
				thinkingCredits: 0,
				toolCredits: 0,
				billableToolCount: 0,
				excludedToolCount: 0,
				totalToolCount: 0,
			},
			{
				deps: {
					redis,
					polar,
					now: () => nowMs,
					billingEnabled: false,
					meterId: "meter-ai-1",
					eventName: "ai_usage",
					cacheTtlSeconds: 15,
					staleTtlSeconds: 300,
					ingestBackoffSeconds: 30,
				},
			}
		);

		expect(result.status).toBe("skipped_disabled");
		expect(polar.events.ingest).not.toHaveBeenCalled();
	});
});
