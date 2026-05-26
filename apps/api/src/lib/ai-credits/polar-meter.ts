import { env } from "@api/env";
import { isPolarEnabled } from "@api/lib/billing-mode";
import polarClient from "@api/lib/polar";
import { getRedis } from "@api/redis";

const METER_CACHE_KEY_PREFIX = "ai-credit:meter";
const METER_LOCK_KEY_PREFIX = "ai-credit:meter-lock";
const INGEST_BACKOFF_KEY_PREFIX = "ai-credit:ingest-backoff";
const METER_LOCK_TTL_MS = 4000;

export type AiCreditMeterSource =
	| "live"
	| "cache"
	| "stale_cache"
	| "outage"
	| "disabled";

export type AiCreditMeterState = {
	organizationId: string;
	meterId: string | null;
	balance: number | null;
	consumedUnits: number | null;
	creditedUnits: number | null;
	meterBacked: boolean;
	source: AiCreditMeterSource;
	lastSyncedAt: string | null;
	outage: boolean;
	outageReason?:
		| "meter_not_configured"
		| "meter_not_found"
		| "polar_error"
		| "lock_contention";
};

export type IngestAiCreditUsageInput = {
	organizationId: string;
	credits: number;
	workflowRunId: string;
	modelId: string;
	modelIdOriginal?: string;
	modelMigrationApplied?: boolean;
	mode: "normal" | "outage";
	baseCredits: number;
	modelCredits: number;
	thinkingCredits: number;
	toolCredits: number;
	billableToolCount: number;
	excludedToolCount: number;
	totalToolCount: number;
	reasoningTokens?: number;
};

export type GrantAiCreditUsageInput = {
	organizationId: string;
	websiteId: string;
	amount: number;
	adminUserId: string;
};

export type IngestAiCreditUsageStatus =
	| "ingested"
	| "failed"
	| "skipped_backoff"
	| "skipped_zero"
	| "skipped_disabled";

export type GrantAiCreditUsageStatus =
	| "ingested"
	| "failed"
	| "skipped_disabled";

export type IngestAiCreditUsageResult = {
	status: IngestAiCreditUsageStatus;
};

export type GrantAiCreditUsageResult = {
	status: GrantAiCreditUsageStatus;
};

type EventMetadataValue = string | number | boolean;

type RedisLike = {
	get: (key: string) => Promise<string | null>;
	set: (
		key: string,
		value: string,
		...args: Array<string | number>
	) => Promise<string | null>;
	del: (...keys: string[]) => Promise<number>;
};

type PolarLike = {
	customers: {
		getStateExternal: (params: { externalId: string }) => Promise<{
			activeMeters: Array<{
				meterId: string;
				balance: number;
				consumedUnits: number;
				creditedUnits: number;
			}>;
		}>;
	};
	events: {
		ingest: (params: {
			events: Array<{
				name: string;
				externalCustomerId: string;
				metadata?: Record<string, EventMetadataValue>;
			}>;
		}) => Promise<unknown>;
	};
};

type GatewayDeps = {
	redis: RedisLike;
	polar: PolarLike;
	now: () => number;
	billingEnabled: boolean;
	meterId: string;
	eventName: string;
	cacheTtlSeconds: number;
	staleTtlSeconds: number;
	ingestBackoffSeconds: number;
};

type GatewayOptions = {
	deps?: Partial<GatewayDeps>;
};

type CachedMeterEntry = Omit<AiCreditMeterState, "source">;

function buildMeterCacheKey(organizationId: string): string {
	return `${METER_CACHE_KEY_PREFIX}:${organizationId}`;
}

function buildMeterLockKey(organizationId: string): string {
	return `${METER_LOCK_KEY_PREFIX}:${organizationId}`;
}

function buildIngestBackoffKey(organizationId: string): string {
	return `${INGEST_BACKOFF_KEY_PREFIX}:${organizationId}`;
}

function resolveDeps(overrides?: Partial<GatewayDeps>): GatewayDeps {
	return {
		redis: (overrides?.redis ?? getRedis()) as RedisLike,
		polar: (overrides?.polar ?? polarClient) as PolarLike,
		now: overrides?.now ?? Date.now,
		billingEnabled: overrides?.billingEnabled ?? isPolarEnabled(),
		meterId: overrides?.meterId ?? env.POLAR_AI_USAGE_METER_ID,
		eventName: overrides?.eventName ?? env.AI_CREDIT_USAGE_EVENT_NAME,
		cacheTtlSeconds:
			overrides?.cacheTtlSeconds ?? env.AI_CREDIT_BALANCE_CACHE_TTL_SECONDS,
		staleTtlSeconds:
			overrides?.staleTtlSeconds ?? env.AI_CREDIT_BALANCE_STALE_TTL_SECONDS,
		ingestBackoffSeconds:
			overrides?.ingestBackoffSeconds ?? env.AI_CREDIT_INGEST_BACKOFF_SECONDS,
	};
}

function toDisabledState(params: {
	organizationId: string;
	nowMs: number;
}): AiCreditMeterState {
	return {
		organizationId: params.organizationId,
		meterId: null,
		balance: null,
		consumedUnits: null,
		creditedUnits: null,
		meterBacked: false,
		source: "disabled",
		lastSyncedAt: toTimestamp(params.nowMs),
		outage: false,
	};
}

function parseCachedEntry(raw: string | null): CachedMeterEntry | null {
	if (!raw) {
		return null;
	}

	try {
		const parsed = JSON.parse(raw) as Partial<CachedMeterEntry>;
		if (
			typeof parsed !== "object" ||
			!parsed ||
			typeof parsed.organizationId !== "string"
		) {
			return null;
		}

		return {
			organizationId: parsed.organizationId,
			meterId: typeof parsed.meterId === "string" ? parsed.meterId : null,
			balance: typeof parsed.balance === "number" ? parsed.balance : null,
			consumedUnits:
				typeof parsed.consumedUnits === "number" ? parsed.consumedUnits : null,
			creditedUnits:
				typeof parsed.creditedUnits === "number" ? parsed.creditedUnits : null,
			meterBacked: parsed.meterBacked === true,
			lastSyncedAt:
				typeof parsed.lastSyncedAt === "string" ? parsed.lastSyncedAt : null,
			outage: parsed.outage === true,
			outageReason:
				parsed.outageReason === "meter_not_configured" ||
				parsed.outageReason === "meter_not_found" ||
				parsed.outageReason === "polar_error" ||
				parsed.outageReason === "lock_contention"
					? parsed.outageReason
					: undefined,
		};
	} catch {
		return null;
	}
}

function toTimestamp(nowMs: number): string {
	return new Date(nowMs).toISOString();
}

function isWithinSeconds(params: {
	nowMs: number;
	isoTimestamp: string | null;
	seconds: number;
}): boolean {
	if (!(params.isoTimestamp && params.seconds > 0)) {
		return false;
	}

	const parsed = Date.parse(params.isoTimestamp);
	if (Number.isNaN(parsed)) {
		return false;
	}

	return params.nowMs - parsed <= params.seconds * 1000;
}

async function writeCachedEntry(params: {
	redis: RedisLike;
	key: string;
	entry: CachedMeterEntry;
	staleTtlSeconds: number;
}): Promise<void> {
	await params.redis.set(
		params.key,
		JSON.stringify(params.entry),
		"EX",
		Math.max(1, params.staleTtlSeconds)
	);
}

function toOutageState(params: {
	organizationId: string;
	meterId: string | null;
	reason: NonNullable<AiCreditMeterState["outageReason"]>;
	nowMs: number;
	source?: AiCreditMeterSource;
}): AiCreditMeterState {
	return {
		organizationId: params.organizationId,
		meterId: params.meterId,
		balance: null,
		consumedUnits: null,
		creditedUnits: null,
		meterBacked: false,
		source: params.source ?? "outage",
		lastSyncedAt: toTimestamp(params.nowMs),
		outage: true,
		outageReason: params.reason,
	};
}

function withSource(
	entry: CachedMeterEntry,
	source: AiCreditMeterSource
): AiCreditMeterState {
	return {
		...entry,
		source,
	};
}

async function releaseLock(params: {
	redis: RedisLike;
	lockKey: string;
	lockToken: string;
}): Promise<void> {
	try {
		const currentToken = await params.redis.get(params.lockKey);
		if (currentToken === params.lockToken) {
			await params.redis.del(params.lockKey);
		}
	} catch {
		// Best-effort cleanup only.
	}
}

function optimisticConsumeCredits(params: {
	entry: CachedMeterEntry;
	credits: number;
	nowMs: number;
}): CachedMeterEntry {
	const nextBalance =
		typeof params.entry.balance === "number"
			? params.entry.balance - params.credits
			: null;
	const nextConsumed =
		typeof params.entry.consumedUnits === "number"
			? params.entry.consumedUnits + params.credits
			: null;

	return {
		...params.entry,
		balance: nextBalance,
		consumedUnits: nextConsumed,
		lastSyncedAt: toTimestamp(params.nowMs),
	};
}

function optimisticGrantCredits(params: {
	entry: CachedMeterEntry;
	amount: number;
	nowMs: number;
}): CachedMeterEntry {
	const nextBalance =
		typeof params.entry.balance === "number"
			? params.entry.balance + params.amount
			: null;
	const nextCredited =
		typeof params.entry.creditedUnits === "number"
			? params.entry.creditedUnits + params.amount
			: null;

	return {
		...params.entry,
		balance: nextBalance,
		creditedUnits: nextCredited,
		lastSyncedAt: toTimestamp(params.nowMs),
	};
}

export async function getAiCreditMeterState(
	organizationId: string,
	options?: GatewayOptions
): Promise<AiCreditMeterState> {
	const deps = resolveDeps(options?.deps);
	const nowMs = deps.now();
	const meterId = deps.meterId || null;

	if (!deps.billingEnabled) {
		return toDisabledState({
			organizationId,
			nowMs,
		});
	}

	if (!meterId) {
		return toOutageState({
			organizationId,
			meterId: null,
			reason: "meter_not_configured",
			nowMs,
		});
	}

	const cacheKey = buildMeterCacheKey(organizationId);
	const lockKey = buildMeterLockKey(organizationId);
	try {
		const rawCache = await deps.redis.get(cacheKey);
		const cached = parseCachedEntry(rawCache);

		if (
			cached &&
			isWithinSeconds({
				nowMs,
				isoTimestamp: cached.lastSyncedAt,
				seconds: deps.cacheTtlSeconds,
			})
		) {
			return withSource(cached, "cache");
		}

		const lockToken = `${organizationId}:${nowMs}:${Math.random().toString(36).slice(2)}`;
		const acquiredLock =
			(await deps.redis.set(
				lockKey,
				lockToken,
				"PX",
				METER_LOCK_TTL_MS,
				"NX"
			)) === "OK";

		if (!acquiredLock) {
			if (
				cached &&
				isWithinSeconds({
					nowMs,
					isoTimestamp: cached.lastSyncedAt,
					seconds: deps.staleTtlSeconds,
				})
			) {
				return withSource(cached, "stale_cache");
			}

			return toOutageState({
				organizationId,
				meterId,
				reason: "lock_contention",
				nowMs,
			});
		}

		try {
			const state = await deps.polar.customers.getStateExternal({
				externalId: organizationId,
			});
			const activeMeters = Array.isArray(state.activeMeters)
				? state.activeMeters
				: [];
			const meter = activeMeters.find((entry) => entry.meterId === meterId);

			if (!meter) {
				const outageState = toOutageState({
					organizationId,
					meterId,
					reason: "meter_not_found",
					nowMs,
					source: "live",
				});

				await writeCachedEntry({
					redis: deps.redis,
					key: cacheKey,
					entry: {
						...outageState,
					},
					staleTtlSeconds: deps.staleTtlSeconds,
				});

				return outageState;
			}

			const nextState: AiCreditMeterState = {
				organizationId,
				meterId,
				balance: meter.balance,
				consumedUnits: meter.consumedUnits,
				creditedUnits: meter.creditedUnits,
				meterBacked: true,
				source: "live",
				lastSyncedAt: toTimestamp(nowMs),
				outage: false,
			};

			await writeCachedEntry({
				redis: deps.redis,
				key: cacheKey,
				entry: {
					...nextState,
				},
				staleTtlSeconds: deps.staleTtlSeconds,
			});

			return nextState;
		} catch (error) {
			console.error(
				`[ai-credits] Failed to fetch Polar meter state for org=${organizationId}:`,
				error
			);

			if (
				cached &&
				isWithinSeconds({
					nowMs,
					isoTimestamp: cached.lastSyncedAt,
					seconds: deps.staleTtlSeconds,
				})
			) {
				return withSource(cached, "stale_cache");
			}

			return toOutageState({
				organizationId,
				meterId,
				reason: "polar_error",
				nowMs,
			});
		} finally {
			await releaseLock({
				redis: deps.redis,
				lockKey,
				lockToken,
			});
		}
	} catch (error) {
		console.error(
			`[ai-credits] Meter gateway failure for org=${organizationId}:`,
			error
		);
		return toOutageState({
			organizationId,
			meterId,
			reason: "polar_error",
			nowMs,
		});
	}
}

export async function ingestAiCreditUsage(
	input: IngestAiCreditUsageInput,
	options?: GatewayOptions
): Promise<IngestAiCreditUsageResult> {
	const deps = resolveDeps(options?.deps);

	if (!deps.billingEnabled) {
		return { status: "skipped_disabled" };
	}

	if (input.credits <= 0) {
		return { status: "skipped_zero" };
	}

	const ingestBackoffKey = buildIngestBackoffKey(input.organizationId);
	try {
		if (deps.ingestBackoffSeconds > 0) {
			const activeBackoff = await deps.redis.get(ingestBackoffKey);
			if (activeBackoff) {
				return { status: "skipped_backoff" };
			}
		}
	} catch {
		// Ignore Redis read errors and attempt ingest normally.
	}

	try {
		await deps.polar.events.ingest({
			events: [
				{
					name: deps.eventName,
					externalCustomerId: input.organizationId,
					metadata: {
						credits: input.credits,
						workflowRunId: input.workflowRunId,
						modelId: input.modelId,
						...(input.modelIdOriginal
							? {
									modelIdOriginal: input.modelIdOriginal,
									modelMigrationApplied: input.modelMigrationApplied === true,
								}
							: {}),
						mode: input.mode,
						baseCredits: input.baseCredits,
						modelCredits: input.modelCredits,
						thinkingCredits: input.thinkingCredits,
						toolCredits: input.toolCredits,
						billableToolCount: input.billableToolCount,
						excludedToolCount: input.excludedToolCount,
						totalToolCount: input.totalToolCount,
						...(typeof input.reasoningTokens === "number"
							? { reasoningTokens: input.reasoningTokens }
							: {}),
					},
				},
			],
		});
	} catch (error) {
		console.error(
			`[ai-credits] Failed to ingest usage event for org=${input.organizationId}:`,
			error
		);
		try {
			if (deps.ingestBackoffSeconds > 0) {
				await deps.redis.set(
					ingestBackoffKey,
					toTimestamp(deps.now()),
					"EX",
					Math.max(1, deps.ingestBackoffSeconds)
				);
			}
		} catch {
			// Ignore backoff write failures.
		}
		return { status: "failed" };
	}

	const cacheKey = buildMeterCacheKey(input.organizationId);
	let rawCache: string | null = null;
	try {
		rawCache = await deps.redis.get(cacheKey);
	} catch {
		return { status: "ingested" };
	}
	const cached = parseCachedEntry(rawCache);

	if (!cached?.meterBacked) {
		return { status: "ingested" };
	}

	const updated = optimisticConsumeCredits({
		entry: cached,
		credits: input.credits,
		nowMs: deps.now(),
	});

	try {
		await writeCachedEntry({
			redis: deps.redis,
			key: cacheKey,
			entry: updated,
			staleTtlSeconds: deps.staleTtlSeconds,
		});
	} catch {
		// Cache update is best-effort only.
	}

	return { status: "ingested" };
}

export async function grantAiCreditUsage(
	input: GrantAiCreditUsageInput,
	options?: GatewayOptions
): Promise<GrantAiCreditUsageResult> {
	const deps = resolveDeps(options?.deps);

	if (!deps.billingEnabled) {
		return { status: "skipped_disabled" };
	}

	try {
		await deps.polar.events.ingest({
			events: [
				{
					name: deps.eventName,
					externalCustomerId: input.organizationId,
					metadata: {
						credits: -input.amount,
						websiteId: input.websiteId,
						organizationId: input.organizationId,
						adminUserId: input.adminUserId,
						kind: "admin_grant",
					},
				},
			],
		});
	} catch (error) {
		console.error(
			`[ai-credits] Failed to grant usage credits for org=${input.organizationId}:`,
			error
		);
		return { status: "failed" };
	}

	const cacheKey = buildMeterCacheKey(input.organizationId);
	let rawCache: string | null = null;
	try {
		rawCache = await deps.redis.get(cacheKey);
	} catch {
		return { status: "ingested" };
	}
	const cached = parseCachedEntry(rawCache);

	if (!cached?.meterBacked) {
		return { status: "ingested" };
	}

	const updated = optimisticGrantCredits({
		entry: cached,
		amount: input.amount,
		nowMs: deps.now(),
	});

	try {
		await writeCachedEntry({
			redis: deps.redis,
			key: cacheKey,
			entry: updated,
			staleTtlSeconds: deps.staleTtlSeconds,
		});
	} catch {
		// Cache update is best-effort only.
	}

	return { status: "ingested" };
}
